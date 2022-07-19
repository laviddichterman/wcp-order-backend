import WApp from "../App";

export abstract class WProvider {
  abstract Bootstrap( app : WApp ) : void;
}