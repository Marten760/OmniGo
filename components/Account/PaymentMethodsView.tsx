import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Pi, EyeOff, Copy } from "lucide-react";

const Card = ({ className, children }: { className?: string; children: React.ReactNode }) => (
    <div className={`bg-gray-800 border border-gray-700 rounded-2xl ${className}`}>{children}</div>
);
const CardContent = ({ className, children }: { className?: string, children: React.ReactNode }) => (
    <div className={className}>{children}</div>
);

export function PaymentMethodsView({ user, onBack }: { user: any, onBack: () => void }) {
    const [showWallet, setShowWallet] = useState(false);

    const handleCopy = (text: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        toast.success("Wallet address copied to clipboard!");
    };

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex items-center space-x-4 mb-6">
                <button onClick={onBack} className="p-2 hover:bg-gray-700 rounded-full transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <h3 className="text-xl font-bold text-white">Payment Methods</h3>
            </div>

            {/* Content */}
            <div className="space-y-6">
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full flex items-center justify-center">
                                <Pi size={24} className="text-white" />
                            </div>
                            <div>
                                <h4 className="font-semibold text-white">Pi Wallet</h4>
                                <p className="text-sm text-gray-400">Connected as @{user?.profile?.piUsername || 'N/A'}</p>
                            </div>
                        </div>

                        {user?.profile?.walletAddress ? (
                            <div>
                                <label className="text-sm text-gray-400">Wallet Address</label>
                                <div className="flex items-center gap-2 mt-1 bg-gray-700 border border-gray-600 rounded-lg p-3">
                                    <p className="text-sm font-mono text-white/90 flex-1 break-all">
                                        {showWallet ? user.profile.walletAddress : `${user.profile.walletAddress.slice(0, 8)}...${user.profile.walletAddress.slice(-6)}`}
                                    </p>
                                    <button onClick={() => setShowWallet(!showWallet)} className="text-gray-400 hover:text-white p-1"><EyeOff size={16} /></button>
                                    <button onClick={() => handleCopy(user.profile.walletAddress)} className="text-gray-400 hover:text-white p-1"><Copy size={16} /></button>
                                </div>
                            </div>
                        ) : (
                            <p className="text-center text-gray-400 py-4">No Pi Wallet linked to this account.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}