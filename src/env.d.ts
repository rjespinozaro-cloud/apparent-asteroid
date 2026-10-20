interface Env {
  ADMIN_BOOTSTRAP_TOKEN?: string;
  MASTER_KEY?: string;
  /** Tienda apagada por defecto: ponla a "true" para encenderla. */
  TIENDA_ACTIVA?: string;
}

declare namespace Cloudflare {
  interface Env {
    ADMIN_BOOTSTRAP_TOKEN?: string;
    MASTER_KEY?: string;
    TIENDA_ACTIVA?: string;
  }
}

declare namespace App {
  interface Locals {
    admin: {
      token: string;
      usuario: {
        usuario_id: number;
        usuario: string;
        rol: 'admin' | 'editor';
        activo: number;
      };
      csrf: string;
    } | null;
  }
}