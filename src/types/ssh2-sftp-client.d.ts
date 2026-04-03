declare module "ssh2-sftp-client" {
  interface ConnectOptions {
    host: string;
    port?: number;
    username?: string;
    password?: string;
    privateKey?: string | Buffer;
    readyTimeout?: number;
  }

  class SftpClient {
    connect(options: ConnectOptions): Promise<void>;
    exists(path: string): Promise<false | "d" | "-" | "l">;
    mkdir(path: string, recursive?: boolean): Promise<string>;
    put(input: Buffer, remotePath: string): Promise<string>;
    end(): Promise<void>;
  }

  export default SftpClient;
}
