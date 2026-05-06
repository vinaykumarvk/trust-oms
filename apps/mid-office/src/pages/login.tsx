import { TrustLoginPage } from "@ui/components/trust-login-page";

export default function LoginPage() {
  return (
    <TrustLoginPage
      brandEyebrow="Trust OMS Mid Office"
      heroTitle="Operations control workspace"
      heroDescription="Secure mid-office access for confirmations, exceptions, settlement oversight, fund accounting, and operational control."
      mobileTitle="Mid-office access"
      signInContext="Mid office"
      supportEmail="midoffice-support@trustoms.local"
      rememberKey="trustoms-mid-remember-user"
      userStorageKey="trustoms-user"
      submitLabel="Sign in to mid office"
      recoveryAudience="mid-office account"
      recoveryToastDescription="The mid-office access desk will validate the request and follow up."
      focusLabel="Mid-office focus"
      focusBadge="Control desk"
      focusNotes={[
        "Operations teams can move from confirmation queues to exception triage without losing context.",
        "Settlement, NAV, and valuation tasks keep control evidence visible in the workflow.",
        "Exceptions stay grouped by status, value date, and operational ownership.",
      ]}
      signals={[
        {
          label: "Confirmations",
          value: "T+0",
          description: "Trade matching and exception review stay time-boxed.",
          icon: "shield",
        },
        {
          label: "Fund accounting",
          value: "NAV",
          description: "Valuation, cash, and position checks stay operationally aligned.",
          icon: "wallet",
        },
        {
          label: "Exception desk",
          value: "Live",
          description: "Breaks and workflow status remain visible for resolution.",
          icon: "trend",
        },
      ]}
    />
  );
}
