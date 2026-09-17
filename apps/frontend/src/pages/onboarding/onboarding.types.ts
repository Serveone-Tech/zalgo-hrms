export type OnboardingStatus = "signup" | "profile" | "plan" | "payment" | "active";

export type Plan = {
  id: string; name: string; description: string | null; monthlyPrice: string; yearlyPrice: string; trialDays: number;
  includedEmployees: number; includedBranches: number; includedDevices: number; modules: string[]; badge: string | null;
};

export type StatusResponse = {
  onboardingStatus: OnboardingStatus;
  company: {
    id: string; name: string; slug: string; industry: string | null; companySize: string | null; email: string | null;
    mobile: string | null; website: string | null; gstNumber: string | null; panNumber: string | null; address: string | null;
    country: string; state: string | null; city: string | null; pinCode: string | null; timezone: string; logoUrl: string | null;
  };
  headOffice: { name: string; address: string | null; city: string | null; state: string | null; pinCode: string | null } | null;
  plans: Plan[];
  razorpayKeyId: string;
  trialEnabled: boolean;
};
