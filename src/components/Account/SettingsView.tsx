import { toast } from "sonner";
import { ArrowLeft, Palette, Globe, Bell, LogOut, Sun, Moon, Laptop } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SignOutButton } from "@/SignOutButton";
import { useTheme } from "@/context/ThemeProvider";
import { cn } from "@/lib/utils";

export function SettingsView({ onBack, onLogout }: { onBack: () => void, onLogout: () => void }) {
    const { theme, setTheme } = useTheme();
    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex items-center space-x-4 mb-6">
                <button onClick={onBack} className="p-2 hover:bg-gray-700 rounded-full transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <h3 className="text-xl font-bold text-white">Settings</h3>
            </div>

            <div className="space-y-8">
                {/* App Preferences Section */}
                <div>
                    <h4 className="text-sm font-semibold text-gray-400 mb-3 px-1">Preferences</h4>
                    <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
                        <div className="divide-y divide-gray-700">
                            {/* Dark Mode Setting */}
                            <div className="p-4">
                                <div className="flex items-center gap-4">
                                    <Palette className="h-5 w-5 text-purple-400" />
                                    <div>
                                        <h5 className="font-medium text-white">Theme</h5>
                                        <p className="text-sm text-gray-400">Select your preferred app theme.</p>
                                    </div>
                                </div>
                                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-gray-700 p-1">
                                    <button onClick={() => setTheme('light')} className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50", theme === 'light' ? 'bg-background text-foreground shadow-sm' : 'hover:bg-gray-600')}>
                                        <Sun className="mr-2 h-4 w-4" /> Light
                                    </button>
                                    <button onClick={() => setTheme('dark')} className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50", theme === 'dark' ? 'bg-background text-foreground shadow-sm' : 'hover:bg-gray-600')}>
                                        <Moon className="mr-2 h-4 w-4" /> Dark
                                    </button>
                                    <button onClick={() => setTheme('system')} className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50", theme === 'system' ? 'bg-background text-foreground shadow-sm' : 'hover:bg-gray-600')}>
                                        <Laptop className="mr-2 h-4 w-4" /> System
                                    </button>
                                </div>
                            </div>

                            {/* Language Setting */}
                            <div className="flex items-center justify-between p-4">
                                <div className="flex items-center gap-4">
                                    <Globe className="h-5 w-5 text-purple-400" />
                                    <div>
                                        <h5 className="font-medium text-white">Language</h5>
                                        <p className="text-sm text-gray-400">Select your preferred language.</p>
                                    </div>
                                </div>
                                <button onClick={() => toast.info("Language settings coming soon!")} className="text-sm text-gray-300 bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg transition-colors">
                                    English
                                </button>
                            </div>

                            {/* Notifications Setting */}
                            <div className="flex items-center justify-between p-4">
                                <div className="flex items-center gap-4">
                                    <Bell className="h-5 w-5 text-purple-400" />
                                    <div>
                                        <h5 className="font-medium text-white">Push Notifications</h5>
                                        <p className="text-sm text-gray-400">Order updates and offers.</p>
                                    </div>
                                </div>
                                <Switch onCheckedChange={() => toast.info("Notification settings coming soon!")} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}