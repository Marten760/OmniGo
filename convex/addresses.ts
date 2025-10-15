import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { validateToken } from "./util";
import { Doc, Id } from "./_generated/dataModel";

export const getUserAddresses = query({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    const user = await validateToken(ctx, args.tokenIdentifier);
    const addresses = await ctx.db
      .query("userAddresses")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    
    const profile = await ctx.db.query("userProfiles").withIndex("by_user", q => q.eq("userId", user._id)).unique();

    return {
      addresses,
      defaultAddressId: profile?.defaultAddress,
    };
  },
});

const addressArgs = {
  label: v.string(),
  address: v.string(),
  city: v.string(),
  country: v.string(),
  postalCode: v.optional(v.string()),
};

export const addAddress = mutation({
  args: {
    tokenIdentifier: v.string(),
    ...addressArgs,
  },
  handler: async (ctx, args) => {
    const user = await validateToken(ctx, args.tokenIdentifier);
    const { tokenIdentifier, ...addressData } = args;
    await ctx.db.insert("userAddresses", {
      userId: user._id,
      ...addressData,
    });
  },
});

export const updateAddress = mutation({
  args: {
    tokenIdentifier: v.string(),
    addressId: v.id("userAddresses"),
    ...addressArgs,
  },
  handler: async (ctx, args) => {
    const user = await validateToken(ctx, args.tokenIdentifier);
    const { tokenIdentifier, addressId, ...addressData } = args;
    
    const existingAddress = await ctx.db.get(addressId);
    if (!existingAddress || existingAddress.userId !== user._id) {
      throw new Error("Address not found or permission denied.");
    }

    await ctx.db.patch(addressId, addressData);
  },
});

export const deleteAddress = mutation({
  args: {
    tokenIdentifier: v.string(),
    addressId: v.id("userAddresses"),
  },
  handler: async (ctx, args) => {
    const user = await validateToken(ctx, args.tokenIdentifier);
    const existingAddress = await ctx.db.get(args.addressId);
    if (!existingAddress || existingAddress.userId !== user._id) {
      throw new Error("Address not found or permission denied.");
    }
    await ctx.db.delete(args.addressId);
  },
});

export const setDefaultAddress = mutation({
  args: {
    tokenIdentifier: v.string(),
    addressId: v.id("userAddresses"),
  },
  handler: async (ctx, args) => {
    const user = await validateToken(ctx, args.tokenIdentifier);
    const profile = await ctx.db.query("userProfiles").withIndex("by_user", q => q.eq("userId", user._id)).unique();
    if (!profile) throw new Error("User profile not found.");
    await ctx.db.patch(profile._id, { defaultAddress: args.addressId });
  },
});