import type { JwtPayload } from "./auth.types";

// Augment Express's Request so authenticated handlers can read `req.user`
// (populated by the authentication middleware).
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export {};
