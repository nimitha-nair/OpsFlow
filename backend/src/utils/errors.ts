/**
 * Error carrying the HTTP status a controller should respond with. Thrown by
 * service-layer code and translated to a response in the controller.
 */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
