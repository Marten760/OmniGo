"use node"; // Required for Pi-Backend and Node.js APIs

import { action, internalAction, ActionCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

const PI_API_BASE_URL = "https://api.minepi.com";
const PI_SANDBOX_API_BASE_URL = "https://api.sandbox.minepi.com";

/**
 * Verifies Pi Network webhook signature for security.
 * This is an internal action to keep the webhook secret secure.
 */
export const verifyPiWebhook = internalAction({
  args: {
    headers: v.object({
      x_pi_signature: v.optional(v.string()),
    }),
    rawBody: v.string(),
  },
  handler: async (ctx, { headers, rawBody }) => {
    const signature = headers.x_pi_signature;
    
    if (!signature) {
      return { isValid: false, body: rawBody };
    }
    
    const webhookSecret = process.env.PI_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.warn("PI_WEBHOOK_SECRET not configured. Allowing webhook for development.");
      return { isValid: true, body: rawBody };
    }
    
    try {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');
      
      const providedSignature = signature.replace('sha256=', '');
      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
      );
      
      return { isValid, body: rawBody };
    } catch (error) {
      console.error("Webhook signature verification failed:", error);
      return { isValid: false, body: rawBody };
    }
  },
});

/**
 * Approves a payment on the Pi Network from the server-side.
 */
export const approvePiPayment = action({
  args: {
    tokenIdentifier: v.string(),
    paymentId: v.string(),
    accessToken: v.string(),
    amount: v.optional(v.number()),
    memo: v.optional(v.string()),
    metadata: v.any(),
  },
  handler: async (ctx, { tokenIdentifier, paymentId, accessToken, amount, memo, metadata}) => {
    const user = await ctx.runQuery(internal.users.getUser, { tokenIdentifier });
    if (!user) throw new Error("User must be authenticated to approve a payment.");

    const useSandbox = process.env.PI_SANDBOX === 'true';
    const baseUrl = useSandbox ? "https://api.sandbox.minepi.com" : "https://api.minepi.com";
    const piApiUrl = `${baseUrl}/v2/me`;
    
    let piApiUser;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(piApiUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
    
        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Pi API /me check failed with status ${response.status}: ${errorBody}`);
        }
        piApiUser = await response.json();
        break;
      } catch (error) {
        if (error instanceof Error && error.message.includes('unsuccessful tunnel')) {
          console.warn(`[Payments] Tunnel connection issue detected on attempt ${attempt}. This is common in dev mode. Deploying to production usually resolves this.`);
        }
        console.error(`Attempt ${attempt} to verify access token failed:`, error);
        if (attempt === 3) throw new Error("Pi payment approval failed: Could not verify access token with Pi servers.");
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }

    const userProfile = await ctx.runQuery(internal.users.getProfile, { userId: user._id });
    if (!userProfile) {
      throw new Error("User profile not found for payment approval.");
    }
    if (piApiUser.uid !== userProfile.piUid) {
      throw new Error("Pi user ID mismatch during payment approval.");
    }

    await ctx.runMutation(internal.paymentsQueries.createPaymentRecord, {
      paymentId,
      userId: user._id,
      amount: amount ?? 0,
      memo: memo ?? "",
      metadata,
      status: "approved",
    });

    const piApiKey = process.env.PI_API_KEY;
    if (!piApiKey) {
      console.warn("PI_API_KEY environment variable not set. Using mock approval for development.");
      return { success: true, mock: true };
    }

    try {
      const approveResponse = await fetch(`${baseUrl}/v2/payments/${paymentId}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Key ${piApiKey}` },
      });

      if (!approveResponse.ok) {
        const errorBody = await approveResponse.text();
        throw new Error(`Failed to approve Pi payment: ${errorBody}`);
      }

      return await approveResponse.json();
    } catch (error) {
      console.error("Pi payment approval failed:", error);
      throw error;
    }
  },
});

/**
 * Completes the payment on the Pi Network from the server-side.
 */
export const completePiPayment = action({
  args: {
    paymentId: v.string(),
    txid: v.optional(v.string()),
  },
  handler: async (ctx, { paymentId, txid }): Promise<{ success: boolean; message: string; payment?: any, txid?: string | null }> => {
    const existingPayment: { status?: string } | null = await ctx.runQuery(api.paymentsQueries.getPaymentById, {
      paymentId,
    });
    if (existingPayment?.status === 'completed') {
      console.log(`[completePiPayment] Payment ${paymentId} is already completed in DB. Skipping.`);
      return {
        success: true,
        message: "Payment was already completed.",
        payment: existingPayment,
        txid: (existingPayment as any)?.txid
      };
    }

    const useSandbox = process.env.PI_SANDBOX === 'true';
    const baseUrl = useSandbox ? PI_SANDBOX_API_BASE_URL : PI_API_BASE_URL;

    const piApiKey = process.env.PI_API_KEY;
    if (!piApiKey) {
      console.warn("PI_API_KEY not set. Mocking completion.");
      await ctx.runMutation(internal.paymentsQueries.updatePaymentStatus, { paymentId, status: 'completed', txid: txid || 'mock-txid' });
      // Still process for mock
      await ctx.runMutation(internal.paymentsQueries.processCompletedPayment, { paymentId, payment: null }); // payment arg unused
      return { success: true, message: 'Mock completion successful' };
    }

    // NEW: Call Pi API to complete the payment (required for U2A flow)
    try {
      const completeResponse = await fetch(`${baseUrl}/v2/payments/${paymentId}/complete`, {
        method: 'POST',
        headers: { 
          'Authorization': `Key ${piApiKey}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ txid }),
      });

      if (!completeResponse.ok) {
        const errorBody = await completeResponse.text();
        throw new Error(`Pi complete API failed: ${completeResponse.status} - ${errorBody}`);
      }

      console.log(`[completePiPayment] Successfully called /complete for ${paymentId}`);
    } catch (completeError: any) {
      console.error(`[completePiPayment] /complete API error for ${paymentId}:`, completeError.message);
      // Update to failed but don't throw yet—webhook may still rescue it
      await ctx.runMutation(internal.paymentsQueries.updatePaymentStatus, {
        paymentId,
        status: 'failed',
        failureReason: `Complete API: ${completeError.message}`,
      });
      return { success: false, message: completeError.message };
    }

    try {
      // Fetch payment details (now that it's completed) for confirmation and processing
      const paymentResponse = await fetch(`${baseUrl}/v2/payments/${paymentId}`, {
        headers: { Authorization: `Key ${piApiKey}` },
      });

      if (!paymentResponse.ok) {
        throw new Error(`Failed to fetch payment details: ${paymentResponse.status}`);
      }

      const payment = await paymentResponse.json();

      // Update DB status
      await ctx.runMutation(internal.paymentsQueries.updatePaymentStatus, {
        paymentId,
        status: 'completed',
        txid: txid || payment.transaction?.txid,
      });

      // Process order/payout (payment arg is unused in the mutation, but pass for consistency)
      await ctx.runMutation(internal.paymentsQueries.processCompletedPayment, {
        paymentId,
        payment: { ...payment, txid: txid || payment.transaction?.txid },
      });

      // Webhook will fire shortly after /complete and can act as backup (idempotent)

      return { success: true, message: 'Payment completed successfully', payment, txid: txid || payment.transaction?.txid };
    } catch (error: any) {
      console.error(`[completePiPayment] Post-complete error for payment ${paymentId}:`, error);
      await ctx.runMutation(internal.paymentsQueries.updatePaymentStatus, {
        paymentId,
        status: 'failed',
        failureReason: error.message,
      });
      return { success: false, message: error.message };
    }
  },
});

/**
 * Public action to allow the client to report a cancelled or abandoned payment.
 */
export const reportCancelledPayment = action({
  args: {
    paymentId: v.string(),
  },
  handler: async (ctx, { paymentId }) => {
    await ctx.runMutation(internal.paymentsQueries.updatePaymentStatus, {
      paymentId,
      status: "cancelled",
    });
  },
});

/**
 * Public action to allow a store owner to retry a failed payout.
 */
export const retryFailedPayout = action({
  args: {
    tokenIdentifier: v.string(),
    storeId: v.id("stores"),
    orderId: v.id("orders"),
    amount: v.number(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; reason?: string; txid?: any; }> => {
    const user = await ctx.runQuery(api.auth.getUserFromToken, { tokenIdentifier: args.tokenIdentifier });
    const store = await ctx.runQuery(internal.stores.getStoreForPayout, { storeId: args.storeId });

    if (!user || !store || store.ownerId !== user.tokenIdentifier) {
      throw new ConvexError("You are not authorized to retry this payout.");
    }

    return await ctx.runAction(internal.paymentsActions.payoutToStore, {
      storeId: args.storeId,
      amount: args.amount,
      orderId: args.orderId,
    });
  },
});

/**
 * Internal action to transfer funds from the app wallet to the store owner's wallet.
 */
export const payoutToStore = internalAction({
  args: {
    storeId: v.id("stores"),
    amount: v.number(),
    orderId: v.id("orders"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; reason?: string; txid?: string; willRetry?: boolean; }> => {
    // Fetch store and owner Pi UID (adjust query if piUid is stored differently)
    const store = await ctx.runQuery(internal.stores.getStoreForPayout, { storeId: args.storeId });
    if (!store) {
      const error = new Error("Store or owner not found.");
      console.error(`[payoutToStore] ${error.message}`);
      await ctx.runMutation(internal.paymentsQueries.recordPayout, {
        storeId: args.storeId,
        orderId: args.orderId,
        amount: args.amount,
        status: "failed",
        failureReason: error.message,
      });
      return { success: false, reason: error.message };
    }

    const uid = store.piUid;
    if (!uid || typeof uid !== 'string' || uid.trim() === '') {
      const error: Error = new Error(`No valid Pi UID found for store ${args.storeId}. Ensure the owner has linked their Pi account via 'Link Pi Wallet'.`);
      console.error(`[payoutToStore] ${error.message}`);
      
      // Schedule a retry after 5 minutes to allow time for account linking.
      await ctx.scheduler.runAfter(300000, internal.paymentsActions.payoutToStore, { // 5 minutes
        storeId: args.storeId,
        amount: args.amount,
        orderId: args.orderId,
      });
      
      await ctx.runMutation(internal.paymentsQueries.recordPayout, {
        storeId: args.storeId,
        orderId: args.orderId,
        amount: args.amount,
        status: "pending", // Mark as pending instead of failed
        failureReason: "Awaiting Pi UID linkage. Retrying soon.",
      });
      // Return a specific response indicating a retry will happen.
      return { success: false, reason: error.message, willRetry: true };
    }

    console.log(`[payoutToStore] Using Pi UID: ${uid.slice(0, 8)}... for store ${args.storeId}, order ${args.orderId}.`);

    const apiKey = process.env.PI_API_KEY;
    const walletPrivateSeed = process.env.PI_WALLET_PRIVATE_SEED;
    if (!apiKey || !walletPrivateSeed?.startsWith('S')) {
      const error = new Error("Missing or invalid Pi env vars (PI_API_KEY or PI_WALLET_PRIVATE_SEED). Check Convex dashboard.");
      console.error(`[payoutToStore] ${error.message}`);
      await ctx.runMutation(internal.paymentsQueries.recordPayout, {
        storeId: args.storeId,
        orderId: args.orderId,
        amount: args.amount,
        status: "failed",
        failureReason: error.message,
      });
      return { success: false, reason: error.message };
    }

    // --- Direct API call using fetch to bypass SDK bundling issues ---
    const useSandbox = process.env.PI_SANDBOX === 'true';
    const baseUrl = useSandbox ? PI_SANDBOX_API_BASE_URL : PI_API_BASE_URL;

    // Step 0: Check for and handle any ongoing A2U payments for this UID.
    try {
      const ongoingResponse = await fetch(`${baseUrl}/v2/payments?uid=${uid}&direction=app_to_user`, {
        headers: { Authorization: `Key ${apiKey}` },
      });

      if (ongoingResponse.ok) {
        const ongoingPayments = await ongoingResponse.json();
        const stuckPayment = ongoingPayments.find((p: any) => 
          p.status.developer_approved && !p.status.developer_completed && !p.status.cancelled
        );

        if (stuckPayment) {
          console.log(`[payoutToStore] Found ongoing A2U payment ${stuckPayment.identifier} for UID ${uid}. Attempting to cancel.`);
          
          // Attempt to cancel the stuck payment before proceeding.
          const cancelRes = await fetch(`${baseUrl}/v2/payments/${stuckPayment.identifier}/cancel`, {
            method: 'POST',
            headers: { Authorization: `Key ${apiKey}` },
          });

          if (cancelRes.ok) {
            console.log(`[payoutToStore] Successfully cancelled stuck payment ${stuckPayment.identifier}.`);
          } else {
            const cancelError = await cancelRes.text();
            throw new Error(`Could not resolve ongoing payment ${stuckPayment.identifier}: ${cancelError}`);
          }
        }
      }
    } catch (error: any) {
      // If we fail to handle the ongoing payment, we must abort to avoid the original error.
      throw new Error(`Error while checking for ongoing payments: ${error.message}`);
    }

    const paymentData = {
      amount: parseFloat(args.amount.toFixed(7)), // numeric for create
      memo: `Payout for order ${args.orderId.slice(-6)}`,
      metadata: { orderId: args.orderId, storeId: args.storeId },
      uid,
    };

    try {
      // Step 1: Create the A2U payment (with retry and cleanup for ongoing payments)
      let paymentId: string | null = null;
      let recipientAddress: string | null = null;
      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount < maxRetries) {
        try {
          const bodyToSend = {
            amount: paymentData.amount,
            memo: paymentData.memo,
            metadata: paymentData.metadata,
            uid: uid, // The UID from the store owner
          };

          console.log(`[payoutToStore] Sending create body (attempt ${retryCount + 1}):`, JSON.stringify(bodyToSend));

          const createResponse = await fetch(`${baseUrl}/v2/payments`, {
            method: 'POST',
            headers: { 'Authorization': `Key ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyToSend),
          });

          if (!createResponse.ok) {
            const errorText = await createResponse.text();
            console.error(`[payoutToStore] Full error response: ${errorText}`); // Log the full error
            let errorObj;
            try {
              errorObj = JSON.parse(errorText); // Parse the error response
            } catch (e) {
              throw new Error(`Failed to create payout (unparsable error): ${errorText}`);
            }

            // Check for ongoing_payment_found
            if (errorObj.error === 'ongoing_payment_found' && errorObj.payment && errorObj.payment.identifier) {
              const ongoingPaymentId = errorObj.payment.identifier;
              console.log(`[payoutToStore] Ongoing payment found: ${ongoingPaymentId}. Attempting to cancel...`);

              const cancelResponse = await fetch(`${baseUrl}/v2/payments/${ongoingPaymentId}/cancel`, {
                method: 'POST',
                headers: { Authorization: `Key ${apiKey}` },
              });

              if (!cancelResponse.ok) throw new Error(`Failed to cancel ongoing payment ${ongoingPaymentId}: ${await cancelResponse.text()}`);
              console.log(`[payoutToStore] Successfully cancelled ongoing payment ${ongoingPaymentId}. Retrying create...`);
              retryCount++;
              continue; // Retry create
            } else {
              throw new Error(`Failed to create payout: ${errorText}`);
            }
          }

          const createdPayment = await createResponse.json();
          console.log(`[payoutToStore] Full createdPayment response:`, JSON.stringify(createdPayment, null, 2)); // For debugging

          paymentId = createdPayment.identifier;
          recipientAddress = createdPayment.to_address; // CORRECTED: Use to_address instead of recipient
          console.log(`[payoutToStore] Created A2U payment ${paymentId} for order ${args.orderId}. Recipient: ${recipientAddress?.slice(0, 8)}...`);
          break; // Success, exit loop
        } catch (createError: any) {
          if (retryCount >= maxRetries - 1) throw createError;
          retryCount++;
          console.warn(`[payoutToStore] Create attempt ${retryCount} failed: ${createError.message}. Retrying after cleanup...`);
        }
      }
      if (!paymentId || !recipientAddress) {
        throw new Error('No recipient address returned from create payment after retries.');
      }

      // Step 2: Build, Sign, and Submit Transaction using Stellar SDK
      const StellarSdk = require('stellar-sdk');

      if (!walletPrivateSeed?.startsWith('S')) {
        throw new Error('Invalid PI_WALLET_PRIVATE_SEED (must start with S).');
      }

      const myKeypair = StellarSdk.Keypair.fromSecret(walletPrivateSeed);
      const myPublicKey = myKeypair.publicKey();

      // Network setup: testnet or mainnet
      const networkUrl = useSandbox ? 'https://api.testnet.minepi.com' : 'https://api.mainnet.minepi.com';
      const piNetwork = new StellarSdk.Server(networkUrl);
      const networkPassphrase = useSandbox ? 'Pi Testnet' : 'Pi Network';

      let myAccount;
      let baseFee;
      try {
        [myAccount, baseFee] = await Promise.all([
          piNetwork.loadAccount(myPublicKey),
          piNetwork.fetchBaseFee(),
        ]);
        console.log(`[payoutToStore] Account loaded successfully for ${myPublicKey.slice(0, 8)}... Balance: ${myAccount.balances[0]?.balance || 0}`);
      } catch (error: any) {
        console.error(`[payoutToStore] Account load failed:`, error.message);
        if (error.response?.status === 404) {
          throw new Error(`Wallet not funded: ${myPublicKey}. Fund via Pi Testnet Faucet: https://minepi.com/developer/testnet/faucet`);
        }
        throw new Error(`Stellar error: ${error.message}`);
      }

      // Build transaction
      const paymentOp = StellarSdk.Operation.payment({
        destination: recipientAddress,
        asset: StellarSdk.Asset.native(),
        amount: paymentData.amount.toString(), // string for Stellar
      });

      const timebounds = await piNetwork.fetchTimebounds(180); // 3 min

      let transaction = new StellarSdk.TransactionBuilder(myAccount, {
        fee: baseFee,
        networkPassphrase,
        timebounds,
      })
        .addOperation(paymentOp)
        .addMemo(StellarSdk.Memo.text(paymentId)) // Memo with paymentId is required
        .build();

      // Sign
      transaction.sign(myKeypair);

      // Submit to blockchain
      const submitTxResponse = await piNetwork.submitTransaction(transaction);
      const txid = submitTxResponse.id;
      console.log(`[payoutToStore] Submitted tx ${txid} for payment ${paymentId}.`);

      if (!submitTxResponse.successful) {
       throw new Error(`Transaction failed: ${JSON.stringify(submitTxResponse)}`);
      }

      // Step 3: Complete the payment
      const completeResponse = await fetch(`${baseUrl}/v2/payments/${paymentId}/complete`, {
        method: 'POST',
        headers: { 
          'Authorization': `Key ${apiKey}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ txid }),
      });

      if (!completeResponse.ok) {
        const errorText = await completeResponse.text();
        throw new Error(`Failed to complete payout: ${errorText}`);
      }

      console.log(`[payoutToStore] Completed payment ${paymentId} with txid ${txid}.`);

      await ctx.runMutation(internal.paymentsQueries.recordPayout, {
        storeId: args.storeId,
        orderId: args.orderId,
        amount: args.amount,
        txid: txid,
        status: "completed"
      });
      return { success: true, txid };
    } catch (error: any) {
      console.error(`[payoutToStore] Failed for order ${args.orderId}:`, error.message);
      await ctx.runMutation(internal.paymentsQueries.recordPayout, {
        storeId: args.storeId,
        orderId: args.orderId,
        amount: args.amount,
        status: "failed",
        failureReason: error.message,
      });
      return { success: false, reason: error.message };
    }
  },
});


/**
 * Server-side action to handle incomplete payments: Complete U2A if verified, or cancel A2U.
 * Called from onIncompletePaymentFound in authenticate.
 */
export const handleIncompletePaymentAction = action({
  args: {
    paymentId: v.string(),
  },
  handler: async (ctx, { paymentId }): Promise<{ success: boolean; action?: string; txid?: string; reason?: string; mock?: boolean; }> => {
    const useSandbox = process.env.PI_SANDBOX === 'true';
    const baseUrl = useSandbox ? PI_SANDBOX_API_BASE_URL : PI_API_BASE_URL;
    const piApiKey = process.env.PI_API_KEY;
    if (!piApiKey) {
      console.warn("PI_API_KEY not set. Mocking incomplete payment handling.");
      await ctx.runMutation(internal.paymentsQueries.updatePaymentStatus, { 
        paymentId, 
        status: 'completed', 
        txid: 'mock-txid' 
      });
      return { success: true, mock: true, action: 'completed' };
    }

    try {
      const paymentResponse = await fetch(`${baseUrl}/v2/payments/${paymentId}`, {
        headers: { Authorization: `Key ${piApiKey}` },
      });
      if (!paymentResponse.ok) {
        throw new Error(`Failed to fetch payment: ${paymentResponse.status}`);
      }
      const payment = await paymentResponse.json();
      console.log(`[handleIncompletePaymentAction] Fetched payment ${paymentId}: direction=${payment.direction}, status=${JSON.stringify(payment.status)}`);

      const txid = payment.transaction?.txid;

      let actionTaken: string;
      if (payment.direction === 'user_to_app' && payment.status.transaction_verified && !payment.status.developer_completed) {
        if (!txid) throw new Error('No transaction ID found for U2A payment. Cannot complete.');
        const completeResponse = await fetch(`${baseUrl}/v2/payments/${paymentId}/complete`, {
          method: 'POST',
          headers: { 'Authorization': `Key ${piApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ txid }),
        });
        if (!completeResponse.ok) throw new Error(`Complete failed: ${await completeResponse.text()}`);
        actionTaken = 'completed';
        console.log(`[handleIncompletePaymentAction] Completed U2A payment ${paymentId}.`);
      } else if (payment.direction === 'app_to_user' && !payment.status.cancelled) {
        const cancelResponse = await fetch(`${baseUrl}/v2/payments/${paymentId}/cancel`, {
          method: 'POST',
          headers: { Authorization: `Key ${piApiKey}` },
        });
        if (!cancelResponse.ok) throw new Error(`Cancel failed: ${await cancelResponse.text()}`);
        actionTaken = 'cancelled';
        console.log(`[handleIncompletePaymentAction] Cancelled A2U payment ${paymentId}.`);
      } else {
        throw new Error(`Cannot handle payment: direction=${payment.direction}, status=${JSON.stringify(payment.status)}`);
      }

      if (actionTaken === 'completed') {
        await ctx.runMutation(internal.paymentsQueries.updatePaymentStatus, { paymentId, status: 'completed', txid });
        await ctx.runMutation(internal.paymentsQueries.processCompletedPayment, { paymentId, payment });
      } else {
        await ctx.runMutation(internal.paymentsQueries.updatePaymentStatus, { paymentId, status: 'cancelled', failureReason: 'Handled as incomplete' });
      }

      return { success: true, action: actionTaken, txid };
    } catch (error: any) {
      console.error(`[cancelPendingPaymentAction] Failed to cancel ${paymentId}:`, error.message);
      await ctx.runMutation(internal.paymentsQueries.updatePaymentStatus, { paymentId, status: 'failed', failureReason: error.message });
      return { success: false, reason: error.message };
    }
  },
});