import { Ship, LayoutDashboard, Package, FileText, BarChart3, Settings as SettingsIcon, LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth, PageKey } from "@/context/AuthContext";
import { useBranding } from "@/context/BrandingContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const navItems: { title: string; url: string; icon: any; page: PageKey }[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, page: "dashboard" },
  { title: "Shipments", url: "/shipments", icon: Package, page: "shipments" },
  { title: "Costs", url: "/costs", icon: FileText, page: "costs" },
  { title: "Cost Dashboard", url: "/cost-dashboard", icon: BarChart3, page: "costs" },
  { title: "Settings", url: "/settings", icon: SettingsIcon, page: "settings" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { can, signOut, displayName, isAdmin } = useAuth();
  const { branding } = useBranding();

  const visibleItems = navItems.filter((it) => can(it.page, "view"));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={branding.companyName}
              style={{ width: branding.logoWidth, height: branding.logoHeight }}
              className="object-contain flex-shrink-0"
            />
          ) : (
            <Ship className="h-6 w-6 text-sidebar-primary flex-shrink-0" />
          )}
          {!collapsed && (
            <span className="font-semibold text-base text-sidebar-primary-foreground tracking-tight">
              {branding.companyName || "LogiTrack"}
            </span>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 border-t border-sidebar-border">
        {!collapsed && displayName && (
          <div className="px-2 pb-2 text-xs text-sidebar-foreground/70 truncate">
            {displayName} {isAdmin && <span className="text-sidebar-primary">• Admin</span>}
          </div>
        )}
        <Button variant="ghost" size="sm" className="justify-start w-full" onClick={signOut}>
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">Sign out</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

