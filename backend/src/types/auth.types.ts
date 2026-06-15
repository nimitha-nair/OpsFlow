/**
 * Signed JWT payload. Kept intentionally minimal — anything here is readable by
 * the client (JWTs are signed, not encrypted).
 */
export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

/** Public, password-free view of a user returned on login. */
export interface LoginUserView {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface LoginResponse {
  token: string;
  user: LoginUserView;
}
