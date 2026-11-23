import { useEffect, useState } from "react";
import {
  apiGetUsers,
  apiCreateUser,
  apiUpdateUser,
  apiDeleteUser,
  apiSetUserPermissions,
  apiSetUserRoles,
  type UserRow,
} from "@/lib/api";
import { useAuth, PageKey, PermissionLevel } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Image, Building2, Upload, X, Pencil } from "lucide-react";
import { toast } from "sonner";
import MasterDataPanel from "@/components/MasterDataPanel";
import ExcelImportExportSettings from "@/components/ExcelImportExportSettings";
import { useBranding, BrandingSettings } from "@/context/BrandingContext";

const PAGES: { key: PageKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "shipments", label: "Shipments" },
  { key: "costs", label: "Costs" },
  { key: "settings", label: "Settings" },
];

interface LocalUserRow {
  id: string;
  email: string;
  display_name: string | null;
  role: "admin" | "user";
  perms: Record<PageKey, PermissionLevel>;
}

function toLocalRow(u: UserRow): LocalUserRow {
  const role: "admin" | "user" = u.roles?.includes("admin") ? "admin" : "user";
  const perms: Record<PageKey, PermissionLevel> = {
    dashboard: (u.permissions?.dashboard ?? "none") as PermissionLevel,
    shipments: (u.permissions?.shipments ?? "none") as PermissionLevel,
    costs: (u.permissions?.costs ?? "none") as PermissionLevel,
    settings: (u.permissions?.settings ?? "none") as PermissionLevel,
  };
  return { id: u.id, email: u.email, display_name: u.display_name ?? null, role, perms };
}

export default function SettingsPage() {
  const { isAdmin, user: currentUser } = useAuth();
  const { branding, updateBranding } = useBranding();
  const [tab, setTab] = useState(isAdmin ? "users" : "master");
  const [users, setUsers] = useState<LocalUserRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Branding form state
  const [brandForm, setBrandForm] = useState<BrandingSettings>(branding);
  const [brandSaving, setBrandSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string>(branding.logoUrl || "");

  // Sync branding into local form when context updates
  useEffect(() => {
    setBrandForm(branding);
    setLogoPreview(branding.logoUrl || "");
  }, [branding]);

  // create user dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "user">("user");
  const [newPerms, setNewPerms] = useState<Record<string, PermissionLevel>>({
    dashboard: "view",
    shipments: "view",
    costs: "none",
    settings: "none",
  });

  // Edit user state
  const [editOpen, setEditOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "user">("user");
  const [editPerms, setEditPerms] = useState<Record<string, PermissionLevel>>({
    dashboard: "view",
    shipments: "view",
    costs: "none",
    settings: "none",
  });
  const [editing, setEditing] = useState(false);

  const openEditUser = (u: LocalUserRow) => {
    setEditingUserId(u.id);
    setEditEmail(u.email || "");
    setEditName(u.display_name || "");
    setEditPassword(""); // Blank to not change
    setEditRole(u.role);
    setEditPerms(u.perms);
    setEditOpen(true);
  };

  const saveEditUser = async () => {
    if (!editingUserId) return;
    setEditing(true);
    try {
      const patch: any = {};
      if (editName.trim() !== "") patch.display_name = editName.trim();
      if (editEmail.trim() !== "") patch.email = editEmail.trim();
      if (editPassword) patch.password = editPassword;
      
      if (Object.keys(patch).length > 0) {
        await apiUpdateUser(editingUserId, patch);
      }

      if (editingUserId !== currentUser?.id || editRole === "admin") {
        await apiSetUserRoles(editingUserId, [editRole]);
      }
      
      await apiSetUserPermissions(editingUserId, editPerms);

      toast.success("User updated successfully");
      setEditOpen(false);
      loadUsers();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update user");
    } finally {
      setEditing(false);
    }
  };
  const [creating, setCreating] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const rows = await apiGetUsers();
      setUsers(rows.map(toLocalRow));
    } catch (err: any) {
      toast.error(err?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) loadUsers();
    else setLoading(false);
  }, [isAdmin]);

  const updatePerm = async (userId: string, page: PageKey, level: PermissionLevel) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    const updatedPerms = { ...user.perms, [page]: level };
    try {
      await apiSetUserPermissions(userId, updatedPerms);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, perms: updatedPerms } : u))
      );
      toast.success("Permission updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update permission");
    }
  };

  const updateRole = async (userId: string, newRole: "admin" | "user") => {
    if (userId === currentUser?.id && newRole !== "admin") {
      toast.error("You cannot remove your own admin role");
      return;
    }
    try {
      await apiSetUserRoles(userId, [newRole]);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
      toast.success("Role updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update role");
    }
  };

  const createUser = async () => {
    if (!newEmail || !newPassword) return toast.error("Email and password are required");
    setCreating(true);
    try {
      await apiCreateUser({
        email: newEmail.trim(),
        password: newPassword,
        display_name: newName || newEmail.split("@")[0],
        role: newRole,
        permissions: newPerms,
      });
      toast.success("User created");
      setCreateOpen(false);
      setNewEmail("");
      setNewPassword("");
      setNewName("");
      setNewRole("user");
      setNewPerms({ dashboard: "view", shipments: "view", costs: "none", settings: "none" });
      loadUsers();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const deleteUser = async (userId: string) => {
    if (userId === currentUser?.id) return toast.error("You cannot delete yourself");
    if (!confirm("Delete this user? This action cannot be undone.")) return;
    try {
      await apiDeleteUser(userId);
      toast.success("User removed");
      loadUsers();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete user");
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage users, permissions and app preferences.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {isAdmin && <TabsTrigger value="users">Users</TabsTrigger>}
          <TabsTrigger value="master">Master Data</TabsTrigger>
          {isAdmin && <TabsTrigger value="excel">Excel Import/Export</TabsTrigger>}
          {isAdmin && <TabsTrigger value="branding">Branding &amp; Identity</TabsTrigger>}
        </TabsList>

        {isAdmin && (
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Users &amp; Permissions</CardTitle>
                  <CardDescription>Control who can access each page.</CardDescription>
                </div>
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4" /> Add user
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Create new user</DialogTitle>
                      <DialogDescription>
                        They'll receive these permissions by default. You can change them anytime.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label>Display name</Label>
                        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Jane Doe" />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          placeholder="user@example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Password</Label>
                        <Input
                          type="text"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Minimum 6 characters"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={newRole} onValueChange={(v) => setNewRole(v as "admin" | "user")}>
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Page permissions</Label>
                        <div className="border rounded-md divide-y">
                          {PAGES.map((p) => (
                            <div key={p.key} className="flex items-center justify-between px-3 py-2">
                              <span className="text-sm">{p.label}</span>
                              <Select
                                value={newPerms[p.key]}
                                onValueChange={(v) =>
                                  setNewPerms((prev) => ({ ...prev, [p.key]: v as PermissionLevel }))
                                }
                              >
                                <SelectTrigger className="w-36">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No access</SelectItem>
                                  <SelectItem value="view">View only</SelectItem>
                                  <SelectItem value="edit">View &amp; Edit</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCreateOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={createUser} disabled={creating}>
                        {creating ? "Creating..." : "Create user"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Edit User Dialog */}
                <Dialog open={editOpen} onOpenChange={setEditOpen}>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Edit User</DialogTitle>
                      <DialogDescription>Update user details and permissions. Leave password blank to keep current.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label>Display name</Label>
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Display name" />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          placeholder="user@example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>New Password</Label>
                        <Input
                          type="text"
                          value={editPassword}
                          onChange={(e) => setEditPassword(e.target.value)}
                          placeholder="Enter new password (optional)"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select 
                          value={editRole} 
                          onValueChange={(v) => setEditRole(v as "admin" | "user")}
                          disabled={editingUserId === currentUser?.id}
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Page permissions</Label>
                        <div className="border rounded-md divide-y">
                          {PAGES.map((p) => (
                            <div key={p.key} className="flex items-center justify-between px-3 py-2">
                              <span className="text-sm">{p.label}</span>
                              <Select
                                value={editRole === "admin" ? "edit" : (editPerms[p.key] || "none")}
                                onValueChange={(v) =>
                                  setEditPerms((prev) => ({ ...prev, [p.key]: v as PermissionLevel }))
                                }
                                disabled={editRole === "admin"}
                              >
                                <SelectTrigger className="w-36">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No access</SelectItem>
                                  <SelectItem value="view">View only</SelectItem>
                                  <SelectItem value="edit">View &amp; Edit</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                      <Button onClick={saveEditUser} disabled={editing}>
                        {editing ? "Saving..." : "Save Changes"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Role</TableHead>
                          {PAGES.map((p) => (
                            <TableHead key={p.key}>{p.label}</TableHead>
                          ))}
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((u) => (
                          <TableRow key={u.id}>
                            <TableCell>
                              <div className="font-medium">{u.display_name || u.email}</div>
                              <div className="text-xs text-muted-foreground">{u.email}</div>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={u.role}
                                onValueChange={(v) => updateRole(u.id, v as "admin" | "user")}
                                disabled={u.id === currentUser?.id}
                              >
                                <SelectTrigger className="w-28">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="user">User</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            {PAGES.map((p) => (
                              <TableCell key={p.key}>
                                {u.role === "admin" ? (
                                  <Badge variant="secondary">Full</Badge>
                                ) : (
                                  <Select
                                    value={u.perms[p.key]}
                                    onValueChange={(v) => updatePerm(u.id, p.key, v as PermissionLevel)}
                                  >
                                    <SelectTrigger className="w-32">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">No access</SelectItem>
                                      <SelectItem value="view">View</SelectItem>
                                      <SelectItem value="edit">View &amp; Edit</SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                              </TableCell>
                            ))}
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditUser(u)}
                                title="Edit user"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteUser(u.id)}
                                disabled={u.id === currentUser?.id}
                                title={u.id === currentUser?.id ? "Cannot delete yourself" : "Delete user"}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {users.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={PAGES.length + 3} className="text-center text-muted-foreground py-6">
                              No users yet
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="master" className="space-y-4">
          <MasterDataPanel />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="excel" className="space-y-4">
            <ExcelImportExportSettings />
          </TabsContent>
        )}

        {/* ── Branding & Identity ── */}
        {isAdmin && (
          <TabsContent value="branding" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle>Branding &amp; Identity</CardTitle>
                    <CardDescription>Customize the application name, logo, and appearance across the system.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Company Name */}
                <div className="space-y-2">
                  <Label htmlFor="brand-company-name" className="text-sm font-medium">Company Name</Label>
                  <p className="text-xs text-muted-foreground">Displayed in the sidebar, browser title, and reports.</p>
                  <Input
                    id="brand-company-name"
                    value={brandForm.companyName}
                    onChange={(e) => setBrandForm((prev) => ({ ...prev, companyName: e.target.value }))}
                    placeholder="e.g. SwiftCargo"
                    className="max-w-sm"
                  />
                </div>

                <div className="border-t" />

                {/* Logo Upload */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Application Logo</Label>
                  <p className="text-xs text-muted-foreground">Replaces the default ship icon in the sidebar. Max file size: 5 MB.</p>

                  <div className="flex items-start gap-6">
                    {/* Preview */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/30 overflow-hidden">
                        {logoPreview ? (
                          <img
                            src={logoPreview}
                            alt="Logo preview"
                            style={{ width: brandForm.logoWidth, height: brandForm.logoHeight }}
                            className="object-contain"
                          />
                        ) : (
                          <Image className="h-8 w-8 text-muted-foreground/40" />
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground">Preview</span>
                    </div>

                    {/* Controls */}
                    <div className="flex-1 space-y-4">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const input = document.createElement("input");
                            input.type = "file";
                            input.accept = "image/*";
                            input.onchange = (e: any) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 5 * 1024 * 1024) {
                                toast.error("Logo file exceeds the 5 MB size limit.");
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = () => {
                                const dataUrl = reader.result as string;
                                setLogoPreview(dataUrl);
                                setBrandForm((prev) => ({ ...prev, logoUrl: dataUrl }));
                              };
                              reader.readAsDataURL(file);
                            };
                            input.click();
                          }}
                        >
                          <Upload className="h-4 w-4 mr-1" /> Choose Image
                        </Button>
                        {logoPreview && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setLogoPreview("");
                              setBrandForm((prev) => ({ ...prev, logoUrl: "" }));
                            }}
                          >
                            <X className="h-4 w-4 mr-1" /> Remove
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 max-w-xs">
                        <div className="space-y-1">
                          <Label htmlFor="brand-logo-w" className="text-xs">Width (px)</Label>
                          <Input
                            id="brand-logo-w"
                            type="number"
                            min={16}
                            max={256}
                            value={brandForm.logoWidth}
                            onChange={(e) => setBrandForm((prev) => ({ ...prev, logoWidth: Math.max(16, Math.min(256, Number(e.target.value) || 32)) }))}
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="brand-logo-h" className="text-xs">Height (px)</Label>
                          <Input
                            id="brand-logo-h"
                            type="number"
                            min={16}
                            max={256}
                            value={brandForm.logoHeight}
                            onChange={(e) => setBrandForm((prev) => ({ ...prev, logoHeight: Math.max(16, Math.min(256, Number(e.target.value) || 32)) }))}
                            className="h-9"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t" />

                {/* Save */}
                <div className="flex items-center gap-3">
                  <Button
                    onClick={async () => {
                      setBrandSaving(true);
                      try {
                        await updateBranding(brandForm);
                        toast.success("Branding settings saved successfully!");
                      } catch (err: any) {
                        toast.error(err?.message || "Failed to save branding settings");
                      } finally {
                        setBrandSaving(false);
                      }
                    }}
                    disabled={brandSaving}
                  >
                    {brandSaving ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Saving...</>
                    ) : (
                      "Save Branding"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setBrandForm(branding);
                      setLogoPreview(branding.logoUrl || "");
                    }}
                  >
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
