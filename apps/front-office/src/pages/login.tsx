import { TrustLoginPage } from "@ui/components/trust-login-page";

export default function LoginPage() {
  return (
    <TrustLoginPage
      brandEyebrow="Trust OMS Front Office"
      heroTitle="Relationship banking workspace"
      heroDescription="Secure front-office access for relationship managers, order capture, approvals, suitability checks, and client portfolio conversations."
      mobileTitle="Front-office access"
      signInContext="Front office"
      supportEmail="frontoffice-support@trustoms.local"
      rememberKey="trustoms-front-remember-user"
      userStorageKey="trustoms-user"
      submitLabel="Sign in to front office"
      recoveryAudience="front-office account"
      recoveryToastDescription="The front-office access desk will validate the request and follow up."
      focusLabel="Front-office focus"
      focusBadge="Client coverage"
      focusNotes={[
        "Relationship managers can resume client books, suitability checks, and order capture from one workspace.",
        "Approval queues keep supervisor reviews close to mandate, risk, and client context.",
        "Trading handoff views preserve order details before execution and downstream operations.",
      ]}
      signals={[
        {
          label: "Client coverage",
          value: "RM",
          description: "Client books, mandates, and conversations stay connected.",
          icon: "wallet",
        },
        {
          label: "Order control",
          value: "4-eye",
          description: "Suitability and approval checkpoints remain visible.",
          icon: "shield",
        },
        {
          label: "Market action",
          value: "Live",
          description: "Orders move from capture to handoff with current status.",
          icon: "trend",
        },
      ]}
    />
  );
}
