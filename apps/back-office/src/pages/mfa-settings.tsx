import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/input';
import { Badge } from '@ui/components/ui/badge';
import { useToast } from '@ui/components/ui/toast';
import { Shield, ShieldCheck, ShieldOff, Copy, RefreshCw } from 'lucide-react';

export default function MFASettings() {
  const { toast } = useToast();
  const [status, setStatus] = useState<{
    mfa_enabled: boolean;
    enrolled: boolean;
    verified: boolean;
    backup_codes_remaining: number;
  } | null>(null);

  const [enrollData, setEnrollData] = useState<{
    secret: string;
    qrCodeDataUrl: string;
    backupCodes: string[];
  } | null>(null);

  const [verifyToken, setVerifyToken] = useState('');
  const [disableToken, setDisableToken] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/v1/mfa/status', { credentials: 'include' });
      if (res.ok) setStatus(await res.json());
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchStatus(); }, []);

  const startEnrollment = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/mfa/enroll', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: 'Error', description: err.error, variant: 'destructive' });
        return;
      }
      const data = await res.json();
      setEnrollData(data);
      toast({ title: 'MFA Enrollment Started', description: 'Scan the QR code with your authenticator app.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to start enrollment', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const confirmEnrollment = async () => {
    if (!verifyToken || verifyToken.length !== 6) {
      toast({ title: 'Error', description: 'Enter a 6-digit code', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/v1/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: verifyToken }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: 'Verification Failed', description: err.error, variant: 'destructive' });
        return;
      }
      toast({ title: 'MFA Activated', description: 'Your account is now protected with two-factor authentication.' });
      setEnrollData(null);
      setVerifyToken('');
      fetchStatus();
    } catch {
      toast({ title: 'Error', description: 'Verification failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const disableMFA = async () => {
    if (!disableToken || disableToken.length !== 6) {
      toast({ title: 'Error', description: 'Enter a 6-digit code to confirm', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/v1/mfa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: disableToken }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: 'Error', description: err.error, variant: 'destructive' });
        return;
      }
      toast({ title: 'MFA Disabled', description: 'Two-factor authentication has been removed from your account.' });
      setDisableToken('');
      fetchStatus();
    } catch {
      toast({ title: 'Error', description: 'Failed to disable MFA', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Two-Factor Authentication</h1>
      </div>

      {/* Status Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            MFA Status
            {status?.mfa_enabled ? (
              <Badge variant="default" className="bg-green-600"><ShieldCheck className="h-3 w-3 mr-1" /> Enabled</Badge>
            ) : (
              <Badge variant="secondary"><ShieldOff className="h-3 w-3 mr-1" /> Disabled</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {status?.mfa_enabled
              ? `MFA is active. ${status.backup_codes_remaining} backup codes remaining.`
              : 'Protect your account with an authenticator app (Google Authenticator, Authy, etc.).'
            }
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Enrollment Flow */}
      {!status?.mfa_enabled && !enrollData && (
        <Card>
          <CardHeader>
            <CardTitle>Enable MFA</CardTitle>
            <CardDescription>Set up two-factor authentication using an authenticator app.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={startEnrollment} disabled={loading}>
              <Shield className="h-4 w-4 mr-2" />
              {loading ? 'Setting up...' : 'Set Up MFA'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* QR Code + Verify */}
      {enrollData && (
        <Card>
          <CardHeader>
            <CardTitle>Scan QR Code</CardTitle>
            <CardDescription>Scan this code with your authenticator app, then enter the 6-digit code below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <img src={enrollData.qrCodeDataUrl} alt="TOTP QR Code" className="w-48 h-48" />
            </div>

            <div className="bg-muted p-3 rounded-md">
              <p className="text-xs text-muted-foreground mb-1">Manual entry key:</p>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono flex-1 break-all">{enrollData.secret}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(enrollData.secret);
                    toast({ title: 'Copied', description: 'Secret copied to clipboard' });
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 rounded-md">
              <p className="text-sm font-medium mb-2">Save your backup codes:</p>
              <div className="grid grid-cols-2 gap-1">
                {enrollData.backupCodes.map((code, i) => (
                  <code key={i} className="text-sm font-mono bg-white dark:bg-gray-800 px-2 py-1 rounded">{code}</code>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Store these codes safely. Each can be used once if you lose access to your authenticator.</p>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Enter 6-digit code"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                className="w-40"
              />
              <Button onClick={confirmEnrollment} disabled={loading || verifyToken.length !== 6}>
                {loading ? 'Verifying...' : 'Verify & Activate'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Disable MFA */}
      {status?.mfa_enabled && (
        <Card>
          <CardHeader>
            <CardTitle>Disable MFA</CardTitle>
            <CardDescription>Enter your current authenticator code to disable two-factor authentication.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input
              placeholder="Enter 6-digit code"
              value={disableToken}
              onChange={(e) => setDisableToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              className="w-40"
            />
            <Button variant="destructive" onClick={disableMFA} disabled={loading || disableToken.length !== 6}>
              {loading ? 'Disabling...' : 'Disable MFA'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
