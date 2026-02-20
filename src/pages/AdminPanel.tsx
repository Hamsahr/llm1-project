import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export default function AdminPanel() {
  const { role } = useAuth();
  const [documents, setDocuments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    if (role === "admin") loadData();
  }, [role]);

  const loadData = async () => {
    const [docsRes, usersRes] = await Promise.all([
      supabase.from("documents").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*, user_roles(role)"),
    ]);
    setDocuments(docsRes.data ?? []);
    setUsers(usersRes.data ?? []);
  };

  if (role !== "admin") return <Navigate to="/" replace />;

  const deleteDocument = async (id: string, filePath: string) => {
    await supabase.storage.from("documents").remove([filePath]);
    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) toast.error("Delete failed");
    else { toast.success("Document deleted"); loadData(); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Admin Panel</h1>
      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
          <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="documents" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Processed</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map(doc => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">{doc.title}</TableCell>
                      <TableCell><Badge variant="secondary" className="capitalize">{doc.category}</Badge></TableCell>
                      <TableCell>{doc.processed ? "✅" : "⏳"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{new Date(doc.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => deleteDocument(doc.id, doc.file_path)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {documents.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No documents yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.display_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {(u.user_roles as any)?.[0]?.role ?? "none"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
