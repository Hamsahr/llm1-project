import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, MessageSquare, Users, TrendingUp } from "lucide-react";

export default function Dashboard() {
  const { role } = useAuth();
  const [stats, setStats] = useState({ docs: 0, conversations: 0, crm: 0 });

  useEffect(() => {
    const load = async () => {
      const [docs, convos, crm] = await Promise.all([
        supabase.from("documents").select("id", { count: "exact", head: true }),
        supabase.from("chat_conversations").select("id", { count: "exact", head: true }),
        role === "admin" || role === "hr"
          ? supabase.from("crm_data").select("id", { count: "exact", head: true })
          : Promise.resolve({ count: null }),
      ]);
      setStats({
        docs: docs.count ?? 0,
        conversations: convos.count ?? 0,
        crm: (crm as any).count ?? 0,
      });
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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-3">
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
    </div>
  );
}
