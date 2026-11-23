import { SignedIn, SignedOut, SignIn } from "@clerk/clerk-react";
import { Redirect } from "wouter";
import { StudioPage } from "@/components/layout/StudioPage";
import { ClerkSetupNotice, ClerkWidgetFrame } from "@/components/auth/OrgGate";
import { clerkConfigured, studioAppearance } from "@/lib/clerk";

export default function OwnerLoginPage() {
  if (!clerkConfigured) return <ClerkSetupNotice />;
  return (
    <StudioPage section="Boutique access">
      <ClerkWidgetFrame>
        <SignedOut>
          <p className="studio-label">Boutique teams</p>
          <h1>
            Shop sign-in
          </h1>
          <SignIn
            appearance={studioAppearance}
            routing="hash"
            signUpUrl="/create-venue"
            forceRedirectUrl="/catalog"
          />
          <a href="/create-venue" className="studio-text-link">
            Create a boutique profile
          </a>
        </SignedOut>
        <SignedIn>
          <Redirect to="/catalog" />
        </SignedIn>
      </ClerkWidgetFrame>
    </StudioPage>
  );
}
