import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { 
  Home, 
  Map, 
  CreditCard, 
  User, 
  ShoppingCart, 
  Shield, 
  Trophy,
  LogOut,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/",           label: "Home",    icon: Home },
  { href: "/world",      label: "World",   icon: Map },
  { href: "/cards",      label: "Cards",   icon: CreditCard },
  { href: "/profile",    label: "Profile", icon: User },
  { href: "/shop",       label: "Shop",    icon: ShoppingCart },
  { href: "/guilds",     label: "Guilds",  icon: Shield },
  { href: "/leaderboard",label: "Ranks",   icon: Trophy },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { isAuthenticated, user, logout } = useAuth();

  const isMod = (user as any)?.isMod === 1 || (user as any)?.isOwner === true;
  const displayName = (user as any)?.name || "";

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background text-foreground relative">

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-black/50 backdrop-blur-xl sticky top-0 h-screen overflow-y-auto">
        <div className="p-6 flex items-center justify-center border-b border-border/50">
          <div className="text-center">
            <p className="text-[10px] tracking-[0.4em] text-primary/60 uppercase mb-1 font-mono">反逆</p>
            <h1 className="font-serif text-2xl font-bold bg-gradient-to-br from-rose-300 via-primary to-violet-400 bg-clip-text text-transparent neon-text-sky tracking-widest uppercase">
              REQUIEM ORDER
            </h1>
          </div>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className="block">
                <div className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-300 font-medium tracking-wide",
                  isActive
                    ? "bg-primary/15 text-primary border border-primary/40 neon-border-sky"
                    : "text-muted-foreground hover:bg-white/5 hover:text-white"
                )}>
                  <item.icon className={cn("w-5 h-5", isActive && "text-primary")} />
                  <span className="font-sans">{item.label}</span>
                </div>
              </Link>
            );
          })}

          {/* Admin link — only for staff */}
          {isAuthenticated && isMod && (
            <Link href="/admin" className="block">
              <div className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-300 font-medium tracking-wide mt-2",
                location === "/admin"
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/40"
                  : "text-amber-500/60 hover:bg-amber-500/10 hover:text-amber-400"
              )}>
                <Settings className="w-5 h-5" />
                <span className="font-sans">Admin</span>
              </div>
            </Link>
          )}
        </nav>

        {isAuthenticated && user ? (
          <div className="p-4 border-t border-border/50 mt-auto">
            <div className="flex items-center gap-3 mb-4 px-2">
              <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center font-serif text-lg font-bold text-primary">
                {displayName.charAt(0).toUpperCase() || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">Lv. {(user as any).level ?? 1}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-md transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        ) : (
          <div className="p-4 border-t border-border/50 mt-auto">
            <Link href="/login" className="block w-full">
              <div className="w-full py-2 bg-primary/15 hover:bg-primary/25 border border-primary/40 text-primary text-center rounded-md transition-all font-bold tracking-widest text-sm uppercase neon-border-sky">
                Enlist
              </div>
            </Link>
          </div>
        )}
      </aside>

      {/* ── Mobile Top Bar ── */}
      <header className="md:hidden h-16 border-b border-border/50 bg-black/80 backdrop-blur-xl flex items-center justify-between px-4 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <span className="text-primary/50 font-mono text-sm">反逆</span>
          <h1 className="font-serif text-xl font-bold bg-gradient-to-br from-rose-300 to-primary bg-clip-text text-transparent uppercase tracking-widest neon-text-sky">
            REQUIEM ORDER
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated && isMod && (
            <Link href="/admin">
              <Settings className={cn("w-5 h-5 transition-colors", location === "/admin" ? "text-amber-400" : "text-muted-foreground")} />
            </Link>
          )}
          {isAuthenticated ? (
            <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center font-serif font-bold text-primary text-sm">
              {displayName.charAt(0).toUpperCase() || "?"}
            </div>
          ) : (
            <Link href="/login">
              <span className="text-xs font-bold text-primary uppercase tracking-widest">Enlist</span>
            </Link>
          )}
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 w-full pb-20 md:pb-0 overflow-x-hidden">
        {children}
      </main>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 border-t border-border/50 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-around px-2">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href} className="block flex-1">
              <div className="flex flex-col items-center justify-center w-full h-full py-1 space-y-1">
                <item.icon className={cn("w-5 h-5 transition-colors", isActive ? "text-primary filter drop-shadow-[0_0_8px_rgba(225,29,72,0.8)]" : "text-muted-foreground")} />
                <span className={cn("text-[10px] uppercase tracking-wider font-semibold", isActive ? "text-primary" : "text-muted-foreground")}>
                  {item.label}
                </span>
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
