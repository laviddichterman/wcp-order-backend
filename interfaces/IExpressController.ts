import { Router } from 'express';

interface IExpressController {
  path: string;
  router: Router;
}

export default IExpressController;