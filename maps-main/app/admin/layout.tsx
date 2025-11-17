import Link from "next/link";
import { LayoutDashboard, MapPin, Tag, Calendar, User, Settings } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigation = [
    { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
    { name: "Places", href: "/admin/places", icon: MapPin },
    { name: "Deals", href: "/admin/deals", icon: Tag },
    { name: "Events", href: "/admin/events", icon: Calendar },
    { name: "Map Settings", href: "/admin/map-settings", icon: Settings },
    { name: "Account", href: "/admin/account", icon: User },
  ];

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg">
        <div className="flex h-16 items-center justify-center border-b px-4">
          <h1 className="text-xl font-bold text-gray-900">Engage Admin</h1>
        </div>
        <nav className="mt-6 px-3">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="mb-1 flex items-center rounded-lg px-4 py-3 text-gray-700 transition-colors hover:bg-gray-100"
            >
              <item.icon className="h-5 w-5 mr-3" />
              {item.name}
            </Link>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="flex h-16 items-center justify-between border-b bg-white px-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Admin Dashboard</h2>
          <div className="flex items-center gap-4">
            <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center">
              <User className="h-5 w-5 text-gray-600" />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
