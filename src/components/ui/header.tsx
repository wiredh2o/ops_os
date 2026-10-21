import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, Settings, LogOut, ClipboardCheck, Receipt } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { canRequestRma, canReceiveRma } from '@/lib/rma';

export function Header() {
  const { signOut, roles } = useAuth();
  const location = useLocation();

  const navigation = [
    { name: "Dashboard", href: "/", icon: Home },
    { name: "Settings", href: "/settings", icon: Settings },
    { name: "Order taxes", href: "/order-taxes", icon: Receipt },
    ...(canRequestRma(roles) || canReceiveRma(roles) ? [{ name: 'RMAs', href: '/rma', icon: ClipboardCheck }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-start">
          <div className="flex items-center space-x-2">
            <h1 className="text-lg font-semibold">Production Management</h1>
          </div>
          
          <nav className="flex items-center space-x-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              
              return (
                <Button
                  key={item.name}
                  variant={isActive ? "default" : "ghost"}
                  size="sm"
                  asChild
                >
                  <Link to={item.href} className="flex items-center space-x-2">
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline-block">{item.name}</span>
                  </Link>
                </Button>
              );
            })}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="flex items-center space-x-2"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline-block">Sign Out</span>
            </Button>
          </nav>
        </div>
      </div>
    </header>
  );
}