import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, FileText, X, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import DocumentsTable from "@/components/DocumentsTable";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
];

async function computeSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface DuplicateInfo {
  id: string;
  title: string;
  file_path: string;
  matchType: "hash" | "name" | "both";
}

export default function UploadDocuments() {
  const { user, role } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<"hr" | "technical" | "general">("general");
  const [uploading, setUploading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfo | null>(null);
  const [pendingHash, setPendingHash] = useState<string>("");

  const checkDuplicate = async (hash: string, fileName: string): Promise<DuplicateInfo | null> => {
    const { data } = await supabase
      .from("documents")
      .select("id, title, file_path, content_hash, file_name")
      .or(`content_hash.eq.${hash},file_name.eq.${fileName}`);

    if (data && data.length > 0) {
      const doc = data[0];
      const hashMatch = doc.content_hash === hash;
      const nameMatch = doc.file_name === fileName;
      return {
        id: doc.id,
        title: doc.title,
        file_path: doc.file_path,
        matchType: hashMatch && nameMatch ? "both" : hashMatch ? "hash" : "name",
      };
    }
    return null;
  };

  const deleteExistingDoc = async (doc: DuplicateInfo) => {
    await supabase.storage.from("documents").remove([doc.file_path]);
    await supabase.from("document_chunks").delete().eq("document_id", doc.id);
    await supabase.from("documents").delete().eq("id", doc.id);
  };

  const performUpload = async (hash: string) => {
    if (!file || !user) return;
    const filePath = `${user.id}/${Date.now()}_${file.name}`;

    const { error: storageError } = await supabase.storage.from("documents").upload(filePath, file);
    if (storageError) throw storageError;

    const { data: doc, error: dbError } = await supabase
      .from("documents")
      .insert({
        title: title || file.name,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
        category,
        uploaded_by: user.id,
        content_hash: hash,
      })
      .select()
      .single();
    if (dbError) throw dbError;

    const { error: processError } = await supabase.functions.invoke("process-document", {
      body: { documentId: doc.id, filePath, mimeType: file.type },
    });
    if (processError) console.error("Processing error:", processError);

    toast.success("Document uploaded and processing started!");
    resetForm();
    setRefreshKey((k) => k + 1);
  };

  const resetForm = () => {
    setFile(null);
    setTitle("");
    setPendingHash("");
    setDuplicateInfo(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Unsupported file type. Please upload PDF, DOCX, TXT, or CSV.");
      return;
    }

    setUploading(true);
    try {
      const hash = await computeSHA256(file);
      const duplicate = await checkDuplicate(hash, file.name);

      if (duplicate) {
        if (role === "admin") {
          setPendingHash(hash);
          setDuplicateInfo(duplicate);
        } else {
          toast.error("This document already exists in the system.");
        }
        setUploading(false);
        return;
      }

      await performUpload(hash);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleReplaceConfirm = async () => {
    if (!duplicateInfo || !file) return;
    setUploading(true);
    try {
      await deleteExistingDoc(duplicateInfo);
      await performUpload(pendingHash);
      toast.success("Existing document replaced successfully!");
    } catch (err: any) {
      toast.error(err.message || "Replace failed");
    } finally {
      setUploading(false);
      setDuplicateInfo(null);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Upload Documents</h1>
      <div className="max-w-2xl mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upload a Document</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Document title (optional)" />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={(v: any) => setCategory(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hr">HR</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>File (PDF, DOCX, TXT, CSV)</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => inputRef.current?.click()}
                >
                  {file ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <span className="text-sm">{file.name}</span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">Click to select a file</p>
                    </div>
                  )}
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.csv"
                  className="hidden"
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <Button type="submit" disabled={!file || uploading} className="w-full">
                {uploading ? "Uploading..." : "Upload & Process"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Admin duplicate override dialog */}
      <Dialog open={!!duplicateInfo} onOpenChange={(open) => !open && setDuplicateInfo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Duplicate Document Detected
            </DialogTitle>
            <DialogDescription>
              A document matching "{duplicateInfo?.title}" already exists.
              {duplicateInfo?.matchType === "hash" && " The file content is identical."}
              {duplicateInfo?.matchType === "name" && " A file with the same name exists."}
              {duplicateInfo?.matchType === "both" && " Both name and content match."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDuplicateInfo(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReplaceConfirm} disabled={uploading}>
              {uploading ? "Replacing..." : "Replace Existing Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <h2 className="text-lg font-semibold mb-4">Uploaded Documents</h2>
      <DocumentsTable refreshKey={refreshKey} />
    </div>
  );
}
