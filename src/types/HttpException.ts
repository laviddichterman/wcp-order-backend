class HttpException extends Error {
  public status: number;
  public message: any;
  constructor(status: number, message: any) {
    super(message);
    this.status = status;
    this.message = message;
  }
}

export default HttpException;