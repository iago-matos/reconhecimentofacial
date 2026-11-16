import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Evita tela branca. Detalhes técnicos só no console (não são mostrados ao usuário em produção). */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erro na aplicação:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl text-alert">Algo deu errado</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Recarregue a página. Os dados salvos neste aparelho não foram perdidos.</p>
        {import.meta.env.DEV && <pre className="max-w-full overflow-auto text-left text-xs text-accent">{this.state.error.stack}</pre>}
        <button className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground" onClick={() => window.location.reload()}>
          Recarregar
        </button>
      </div>
    );
  }
}
