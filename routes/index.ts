import glob from 'glob';
import { Router } from 'express';
export const GenerateRouter = () => glob
    .sync('**/*.ts', { cwd: `${__dirname}/` })
    .map(filename => require(`./${filename}`))
    .filter(router => Object.getPrototypeOf(router) == Router)
    .reduce((rootRouter, router) => rootRouter.use(router), Router({ mergeParams: true }));

module.exports = GenerateRouter;