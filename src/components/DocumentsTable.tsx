import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Document {
  id: string;
  title: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  file_size: number;
  category: string;
  processed: boolean;
  created_at: string;
  uploaded_by: string;
}

function formatFileType(mime: string | null, fileName: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime === "text/plain") return "TXT";
  if (mime === "text/csv") return "CSV";
  if (mime?.includes("wordprocessingml")) return "DOCX";
  const ext = fileName.split(".").pop()?.toUpperCase();
  return ext || "Unknown";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface DocumentsTableProps {
  refreshKey?: number;
  onCountChange?: (count: number) => void;
}

export default function DocumentsTable({ refreshKey, onCountChange }: DocumentsTableProps) {
  const { role } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch documents:", error);
      toast.error("Failed to load documents");
    } else {
      setDocuments(data ?? []);
      onCountChange?.(data?.length ?? 0);
    }
    setLoading(false);
  }, [onCountChange]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments, refreshKey]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("documents-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents" },
        () => {
          fetchDocuments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDocuments]);

  const handleDelete = async (doc: Document) => {
    setDeleting(doc.id);
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("documents")
        .remove([doc.file_path]);
      if (storageError) console.error("Storage delete error:", storageError);

      // Delete document chunks
      await supabase.from("document_chunks").delete().eq("document_id", doc.id);

      // Delete document record
      const { error: dbError } = await supabase
        .from("documents")
        .delete()
        .eq("id", doc.id);
      if (dbError) throw dbError;

      toast.success(`"${doc.title}" deleted successfully`);
      fetchDocuments();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete document");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" />
        Loading documents...
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No documents uploaded yet.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>File Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Upload Date</TableHead>
            <TableHead>Status</TableHead>
            {(role === "admin") && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => (
            <TableRow key={doc.id} className="hover:bg-muted/30 transition-colors">
              <TableCell className="font-medium max-w-[200px] truncate" title={doc.title}>
                {doc.title}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{formatFileType(doc.mime_type, doc.file_name)}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{formatSize(doc.file_size)}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="capitalize">{doc.category}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {formatDate(doc.created_at)}
              </TableCell>
              <TableCell>
                {doc.processed ? (
                  <Badge className="bg-green-600 hover:bg-green-700 text-white border-0">Ready</Badge>
                ) : (
                  <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white border-0">Processing</Badge>
                )}
              </TableCell>
              {(role === "admin") && (
                <TableCell className="text-right">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={deleting === doc.id}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Document</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{doc.title}"? This will remove the file and all associated data permanently.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(doc)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
