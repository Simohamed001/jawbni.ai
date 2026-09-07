import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      merchantId: string | null;
    };
  }

  interface User {
    merchantId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    merchantId?: string | null;
  }
}
