import glob from 'glob';
import { Router } from 'express';

export interface RouterController { 
    path: String;
    router: Router;
};

export const GenerateRouter = () => glob
    .sync('**/*.ts', { cwd: `${__dirname}/` })
    .map(async (filename) => (await import(`./${filename}`)))
    .filter(router => Object.getPrototypeOf(router) == Router)
    .reduce((rootRouter, router) => rootRouter.use(router), Router({ mergeParams: true }));

module.exports = GenerateRouter;