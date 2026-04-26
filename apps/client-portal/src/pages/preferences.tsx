/**
 * Client Portal - Preferences Page (Phase 5C)
 *
 * Features:
 * - Notification preferences: toggles for Email, SMS, Push, In-App
 * - Communication language: select (English, Filipino)
 * - Save button with success toast
 */

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@ui/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import { Button } from "@ui/components/ui/button";
import { Switch } from "@ui/components/ui/switch";
import { Label } from "@ui/components/ui/label";
import { Separator } from "@ui/components/ui/separator";
import {
  Settings,
  Bell,
  Mail,
  Smartphone,
  Globe,
  CheckCircle,
  Shield,
} from "lucide-react";
import { useToast } from "@ui/components/ui/toast";

// ---- Types ----

interface NotificationPrefs {
  email: boolean;
  sms: boolean;
  push: boolean;
  inApp: boolean;
}

interface Preferences {
  notifications: NotificationPrefs;
  language: string;
}

// ---- Component ----

export default function PreferencesPage() {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [prefs, setPrefs] = useState<Preferences>({
    notifications: {
      email: true,
      sms: false,
      push: true,
      inApp: true,
    },
    language: "en",
  });

  const toggleNotification = (key: keyof NotificationPrefs) => {
    setPrefs((prev) => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        [key]: !prev.notifications[key],
      },
    }));
  };

  const handleSave = () => {
    setSaving(true);
    // Simulate API call
    setTimeout(() => {
      setSaving(false);
      toast({
        title: "Preferences Saved",
        description: "Your preferences have been updated successfully.",
      });
    }, 600);
  };

  const notificationItems = [
    {
      key: "email" as const,
      label: "Email Notifications",
      description: "Receive portfolio updates, statements, and alerts via email",
      icon: Mail,
    },
    {
      key: "sms" as const,
      label: "SMS Notifications",
      description: "Get critical alerts and OTP via text message",
      icon: Smartphone,
    },
    {
      key: "push" as const,
      label: "Push Notifications",
      description: "Browser and mobile push notifications for real-time updates",
      icon: Bell,
    },
    {
      key: "inApp" as const,
      label: "In-App Notifications",
      description: "Show notification badges and alerts within the portal",
      icon: Bell,
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 p-2 sm:p-0">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-gray-100">Preferences</h1>
        <p className="text-sm text-muted-foreground dark:text-gray-400 mt-1">
          Manage your notification and communication preferences
        </p>
      </div>

      {/* Notification Preferences */}
      <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            <div>
              <CardTitle className="text-base text-foreground dark:text-gray-100">
                Notification Preferences
              </CardTitle>
              <CardDescription className="text-muted-foreground dark:text-gray-400">
                Choose how you want to receive notifications
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {notificationItems.map((item, idx) => (
              <div key={item.key}>
                <div className="flex items-center justify-between py-3 sm:py-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted dark:bg-gray-700 shrink-0 mt-0.5">
                      <item.icon className="h-4 w-4 text-muted-foreground dark:text-gray-400" aria-hidden="true" />
                    </div>
                    <div>
                      <Label
                        htmlFor={`toggle-${item.key}`}
                        className="text-sm font-medium text-foreground dark:text-gray-200 cursor-pointer"
                      >
                        {item.label}
                      </Label>
                      <p className="text-xs text-muted-foreground dark:text-gray-400 mt-0.5">
                        {item.description}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id={`toggle-${item.key}`}
                    checked={prefs.notifications[item.key]}
                    onCheckedChange={() => toggleNotification(item.key)}
                    className="data-[state=checked]:bg-teal-600"
                    aria-label={`Toggle ${item.label}`}
                  />
                </div>
                {idx < notificationItems.length - 1 && (
                  <Separator className="bg-muted dark:bg-gray-700" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Communication Language */}
      <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            <div>
              <CardTitle className="text-base text-foreground dark:text-gray-100">
                Communication Language
              </CardTitle>
              <CardDescription className="text-muted-foreground dark:text-gray-400">
                Select your preferred language for communications and reports
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <Label htmlFor="language" className="text-sm text-foreground dark:text-gray-200 mb-2 block">
              Preferred Language
            </Label>
            <Select
              value={prefs.language}
              onValueChange={(val) =>
                setPrefs((prev) => ({ ...prev, language: val }))
              }
            >
              <SelectTrigger className="border-border dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" id="language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="fil">Filipino</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Security Info (read-only) */}
      <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            <div>
              <CardTitle className="text-base text-foreground dark:text-gray-100">
                Security
              </CardTitle>
              <CardDescription className="text-muted-foreground dark:text-gray-400">
                Account security information
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-foreground dark:text-gray-200">
                  Two-Factor Authentication
                </p>
                <p className="text-xs text-muted-foreground dark:text-gray-400">
                  Extra security layer for your account
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <CheckCircle className="h-4 w-4" aria-hidden="true" />
                <span className="text-sm font-medium">Enabled</span>
              </div>
            </div>
            <Separator className="bg-muted dark:bg-gray-700" />
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-foreground dark:text-gray-200">
                  Last Password Change
                </p>
                <p className="text-xs text-muted-foreground dark:text-gray-400">
                  We recommend changing your password every 90 days
                </p>
              </div>
              <span className="text-sm text-muted-foreground dark:text-gray-400">30 days ago</span>
            </div>
            <Separator className="bg-muted dark:bg-gray-700" />
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-foreground dark:text-gray-200">
                  Active Sessions
                </p>
                <p className="text-xs text-muted-foreground dark:text-gray-400">
                  Currently signed-in devices
                </p>
              </div>
              <span className="text-sm text-muted-foreground dark:text-gray-400">1 device</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          className="bg-teal-600 hover:bg-teal-700 text-white px-8"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
              Saving...
            </>
          ) : (
            <>
              <Settings className="h-4 w-4 mr-2" aria-hidden="true" />
              Save Preferences
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
