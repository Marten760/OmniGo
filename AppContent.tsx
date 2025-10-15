import { useState, useEffect, useMemo, useLayoutEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { NavigateFunction } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../convex/_generated/api";
import { Doc, Id } from "../convex/_generated/dataModel";
import { PiSignIn } from "./components/PiSignIn";
import { StoreDetail } from "./components/StoreDetail";
import { OrdersPage } from "./components/OrdersPage";
import { DeliveryDashboard } from "./components/DeliveryDashboard";
import { StoreDashboard } from "./components/StoreDashboard";
import { AccountPage } from "./components/AccountPage";
import { LocationSelector } from "./components/LocationSelector";
import { PrivacyPolicy } from "./components/PrivacyPolicy";
import { TermsOfService } from "./components/TermsOfService";
import { BottomNavigation } from "./components/BottomNavigation";
import { NotificationBell } from "./components/NotificationBell";
import { UserNav } from "./components/dashboard/UserNav";
import { ProductItemDetailModal } from "./components/ProductItemDetailModal";
import { HomePage } from "./components/HomePage";
import { useCart } from "./context/CartContext";
import { ChatsList } from "./components/chat/ChatsList";
import { ChatScreen } from "./components/chat/ChatScreen";
import { ClearCartConfirmation } from "./components/ClearCartConfirmation";
import { usePushNotifications } from "./hooks/usePushNotifications";
import { toast } from "sonner";

interface AppContentProps {
  sessionToken: string | null;
  onLoginSuccess: (token: string) => void;
  onLogout: () => void;
  navigate: NavigateFunction;
}

export function AppContent({ 
  sessionToken, 
  onLoginSuccess, 
  onLogout,
  navigate
}: AppContentProps) {

  const [selectedCountry, setSelectedCountry] = useState<string>("United States");
  const [selectedRegion, setSelectedRegion] = useState<string>("New York");
  const [selectedStore, setSelectedStore] = useState<Id<"stores"> | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<(Doc<"products"> & { storeName: string; storeId: Id<"stores">; imageUrls: (string | null)[]; }) | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedConversationId, setSelectedConversationId] = useState<Id<"conversations"> | null>(null);
  const [currentView, setCurrentView] = useState<string>("home");
  const [filters, setFilters] = useState({
    cuisine: [] as string[],
    storeType: "",
    priceRange: "",
    hasDelivery: undefined as boolean | undefined,
    sortBy: "",
    rating: 0,
  });
  const [legalView, setLegalView] = useState<"privacy" | "terms" | null>(null);

  const { pendingItem, proceedWithNewItem, cancelAddItem } = useCart();
  const updatePresence = useMutation(api.presence.update);
  console.log('🔐 AppContent - sessionToken:', sessionToken);

  // Initialize push notifications
  usePushNotifications();

  // Only call the query when we have a session token
  const user = useQuery(
  api.auth.getUserFromToken, 
  sessionToken ? { tokenIdentifier: sessionToken } : "skip"
  );

  console.log('👤 AppContent - user data:', user);

  // Use useLayoutEffect to scroll to the top before the browser paints the new view.
  // This prevents a "flicker" where the user sees the old scroll position briefly.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' }); // Keep smooth for better UX
  }, [currentView, selectedStore, selectedConversationId]);

  const handleNavigateToChat = (conversationId: Id<"conversations">) => {
    setSelectedConversationId(conversationId);
    setCurrentView('chat');
  };

  // This effect runs only when the user object is first populated.
  // It redirects a newly logged-in user from the default 'home' view to their 'dashboard'.
  useEffect(() => {
    if (user && currentView === "home") { // Only redirect if they are on the initial view
      if (user.profile?.activeRole === 'driver') {
        setCurrentView("delivery"); // Redirect drivers to their dashboard
      } else if (user.profile?.roles?.includes('store_owner')) {
        setCurrentView("dashboard"); // Redirect store owners to their dashboard
      }
    }
  }, [user]); // Intentionally only depends on `user`

  // Effect to automatically reset conversation when navigating away from chat views
  useEffect(() => {
    if (currentView !== 'chats' && currentView !== 'chat' && selectedConversationId) {
      setSelectedConversationId(null);
    }
  }, [currentView, selectedConversationId]);

  // Periodically update user presence
  useEffect(() => {
    if (!sessionToken) return;

    const intervalId = setInterval(() => {
      updatePresence({ tokenIdentifier: sessionToken });
    }, 15000); // Update every 15 seconds

    // Initial update
    updatePresence({ tokenIdentifier: sessionToken });

    return () => clearInterval(intervalId);
  }, [sessionToken, updatePresence]);

  const seedDatabase = useMutation(api.seedData.seedDatabase);
  const storesForSeedCheck = useQuery(api.stores.getStores, {
    country: "United States",
    region: "New York",
    categories: [],
    priceRange: "",
    storeType: "", // Add missing storeType argument
    hasDelivery: undefined,
    sortBy: "",
  });

  const handleSeedDatabase = async () => {
    if (!sessionToken) {
      toast.error("You must be logged in to seed the database.");
      return;
    }
    try {
      await seedDatabase({ tokenIdentifier: sessionToken });
      toast.success("Database seeded successfully!");
    } catch (error) {
      console.error("Failed to seed database:", error);
      toast.error("Failed to seed database");
    }
  };

  const handleLocationDetect = () => {
    toast.success("Location detected! Showing nearby stores.");
  };

  // Animation variants for page transitions
  const pageVariants = {
    initial: {
      opacity: 0,
      y: 20,
    },
    in: {
      opacity: 1,
      y: 0,
    },
    out: {
      opacity: 0,
      y: -20,
    },
  };


  const renderCurrentView = () => {
    if (selectedStore) {
      return (
        <StoreDetail
          storeId={selectedStore}
          onNavigateToChat={handleNavigateToChat}
          onBack={() => setSelectedStore(null)}
        />
      );
    }

    if (selectedConversationId) {
      return (
        <ChatScreen
          conversationId={selectedConversationId}
          onBack={() => {
            setSelectedConversationId(null);
            setCurrentView("chats");
          }}
        />
      );
    }

    switch (currentView) {
      case "home":
        return <HomePage
          selectedCountry={selectedCountry}
          setSelectedCountry={setSelectedCountry}
          selectedRegion={selectedRegion}
          setSelectedRegion={setSelectedRegion}
          handleLocationDetect={handleLocationDetect}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          filters={filters}
          setFilters={setFilters}
          setSelectedStore={setSelectedStore}
          setSelectedProduct={setSelectedProduct}
        />;
      case "orders":
        return <OrdersPage />;
      case "delivery": // Add a new case for the delivery view
        return <DeliveryDashboard onNavigateToChat={handleNavigateToChat} navigate={navigate} />;
      case "dashboard":
        return <StoreDashboard onLogout={onLogout} navigate={navigate} onNavigateToChat={handleNavigateToChat} />;
      case "chats":
        return <ChatsList 
          onSelectConversation={(id) => {
            setSelectedConversationId(id);
            setCurrentView('chat');
          }}
          setCurrentView={setCurrentView}
        />;
      case "account":
        return <AccountPage 
          setCurrentView={setCurrentView} 
          setSelectedStore={setSelectedStore}
          setSelectedProduct={setSelectedProduct}
          onLogout={onLogout} 
        />;
      case "privacy":
        return <PrivacyPolicy onBack={() => setCurrentView("account")} />;
      case "terms":
        return <TermsOfService />;
      case 'chat':
        if (!selectedConversationId) return <div className="text-center p-8">Conversation not found. Please go back.</div>;
        return <ChatScreen 
          conversationId={selectedConversationId}
          onBack={() => {
            setSelectedConversationId(null);
            setCurrentView('chats');
          }}
        />;
      default:
        return <HomePage selectedCountry={selectedCountry} setSelectedCountry={setSelectedCountry} selectedRegion={selectedRegion} setSelectedRegion={setSelectedRegion} handleLocationDetect={handleLocationDetect} searchTerm={searchTerm} setSearchTerm={setSearchTerm} filters={filters} setFilters={setFilters} setSelectedStore={setSelectedStore} setSelectedProduct={setSelectedProduct} />;
    }
  };

  // Show loading state while we have a token but user data is still loading
  if (sessionToken && user === undefined) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading user data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      {!selectedStore && currentView !== 'chat' && (
        <header className="sticky top-0 z-40 bg-gray-900/90 backdrop-blur-md border-b border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-800 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg">
                    <img src="/OmniGo-logo.png" alt="OmniGo Logo" className="w-full h-full rounded-lg" />
                  </div>
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                      OmniGo
                    </h1>
                  </div>
                </div>
                
                <div className="hidden md:block flex-shrink-0">
                  <LocationSelector
                    selectedCountry={selectedCountry}
                    selectedRegion={selectedRegion}
                    onCountryChange={setSelectedCountry}
                    onRegionChange={setSelectedRegion}
                    onLocationDetect={handleLocationDetect}
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-end flex-grow min-w-0 gap-2">
                {sessionToken && (
                  <NotificationBell setCurrentView={setCurrentView} />
                )}
                {sessionToken && <UserNav onLogout={onLogout} />}
              </div>
            </div>
          </div>
        </header>
      )}

      <main className={`flex-1 ${sessionToken && !selectedStore && currentView !== 'chat' ? 'pb-20' : ''}`}>
        {!sessionToken ? (
          <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 p-4">
            <div className="text-center max-w-md w-full p-4 sm:p-6 md:p-8 bg-gray-800/50 border border-gray-700 rounded-3xl shadow-2xl backdrop-blur-lg">              <PiSignIn onLoginSuccess={onLoginSuccess} onShowLegal={setLegalView} />
            </div>
          </div>
        ) : (
          <div className={
            // Apply container styles only to specific views.
            // Chat-related views should be full-width.
            !selectedStore && !['chats', 'chat'].includes(currentView)
              ? "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
              : ""
          }>
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${currentView}-${!!selectedStore}-${!!selectedConversationId}`} // More robust key for transitions
                  initial="initial"
                  animate="in"
                  exit="out"
                  variants={pageVariants}
                  transition={{ type: "tween", ease: "anticipate", duration: 0.4 }}
                >
                  {renderCurrentView()}
                </motion.div>
              </AnimatePresence>
            </div>
        )}
      </main>

      {/* Bottom Navigation */}
      {sessionToken && !selectedStore && currentView !== 'chat' && (
        <div className="pb-safe">
          <BottomNavigation 
            currentView={currentView} 
            setCurrentView={setCurrentView} 
            onResetChat={() => setSelectedConversationId(null)}  // إضافة جديدة
          />
        </div>
      )}

      {/* Confirmation Page for Clearing Cart */}
      {pendingItem && (
        <ClearCartConfirmation onConfirm={proceedWithNewItem} onCancel={cancelAddItem} />
      )}

      {/* Legal Modals for non-logged-in users */}
      {legalView && !sessionToken && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-gray-800 w-full max-w-3xl rounded-2xl border border-gray-700 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
              {legalView === 'privacy' && (
                <PrivacyPolicy onBack={() => setLegalView(null)} />
              )}
              {legalView === 'terms' && (
                <TermsOfService onBack={() => setLegalView(null)} />
              )}
            </div>
          </div>
        </div>
      )}

      {selectedProduct && (
        <ProductItemDetailModal
          isOpen={!!selectedProduct}
          onClose={() => setSelectedProduct(null)}
          item={selectedProduct!}
          onStoreSelect={setSelectedStore}
        />
      )}
    </div>
  );
}