import { Router } from 'express';
export * from "./api/v1/addresses";
export * from "./api/v1/config";
export * from "./api/v1/menu";
export * from "./api/v1/order";
export * from "./api/v1/payments";
export * from "./api/v1/query";

export interface RouterController { 
    path: String;
    router: Router;
};

