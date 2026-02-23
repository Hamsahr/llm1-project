import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, MessageSquare, TrendingUp, Users } from "lucide-react";
import DocumentsTable from "@/components/DocumentsTable";

export default function Dashboard() {
  const { role } = useAuth();
  const [stats, setStats] = useState({ docs: 0, conversations: 0, crm: 0, users: 0 });

  const updateDocCount = useCallback((count: number) => {
    setStats((prev) => ({ ...prev, docs: count }));
  }, []);

  useEffect(() => {
    const load = async () => {
      const convos = await supabase.from("chat_conversations").select("id", { count: "exact", head: true });
      const crm = role === "admin" || role === "hr"
        ? await supabase.from("crm_data").select("id", { count: "exact", head: true })
        : { count: null };
      const usersRes = role === "admin"
        ? await supabase.from("profiles").select("id", { count: "exact", head: true })
        : { count: null };
      setStats((prev) => ({
        ...prev,
        conversations: convos.count ?? 0,
        crm: (crm as any).count ?? 0,
        users: (usersRes as any).count ?? 0,
      }));
    };
    load();
  }, [role]);

  const cards = [
    { title: "Documents", value: stats.docs, icon: FileText, color: "text-primary" },
    { title: "Conversations", value: stats.conversations, icon: MessageSquare, color: "text-primary" },
  ];

  if (role === "admin" || role === "hr") {
    cards.push({ title: "CRM Records", value: stats.crm, icon: TrendingUp, color: "text-primary" });
  }
  if (role === "admin") {
    cards.push({ title: "Users", value: stats.users, icon: Users, color: "text-primary" });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
              <c.icon className={`h-5 w-5 ${c.color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="text-lg font-semibold mb-4">Recent Documents</h2>
      <DocumentsTable onCountChange={updateDocCount} />
    </div>
  );
}
