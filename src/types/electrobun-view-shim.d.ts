declare module "electrobun/view" {
  const Electrobun: {
    Electroview: new (config: any) => any;
  };

  export default Electrobun;

  export class Electroview {
    static defineRPC<T>(config: any): any;
  }
}
