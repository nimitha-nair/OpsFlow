import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiErrorMessage } from "../../lib/users-api";
import { qrStart } from "../../lib/qr-login-api";

interface MobileLoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Shows a QR code that logs the current user in on a phone. The code carries a
 * short-lived, single-use token; scanning it opens /qr-login on the device.
 */
export function MobileLoginDialog({
  open,
  onOpenChange,
}: MobileLoginDialogProps) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = token
    ? `${window.location.origin}/qr-login?token=${encodeURIComponent(token)}`
    : "";

  async function generate() {
    setLoading(true);
    setError(null);
    setToken(null);
    try {
      const r = await qrStart();
      setToken(r.token);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't generate a QR code."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      void generate();
    } else {
      setToken(null);
      setError(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Log in on mobile</DialogTitle>
          <DialogDescription>
            Scan this code with your phone's camera to sign in as yourself. It
            expires in 2 minutes and can be used once.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {loading ? (
            <div className="flex size-[220px] items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button size="sm" variant="outline" onClick={() => void generate()}>
                <RefreshCw className="size-4" />
                Try again
              </Button>
            </div>
          ) : token ? (
            <>
              <div className="rounded-xl bg-white p-3 ring-1 ring-border">
                <QRCodeSVG value={url} size={196} marginSize={0} level="M" />
              </div>
              <Button size="sm" variant="outline" onClick={() => void generate()}>
                <RefreshCw className="size-4" />
                Refresh code
              </Button>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
