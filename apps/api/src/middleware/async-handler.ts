import type { Request, RequestHandler, Response } from "express";

type AsyncRouteHandler = (request: Request, response: Response) => Promise<void>;

export const asyncHandler = (handler: AsyncRouteHandler): RequestHandler => {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
};
