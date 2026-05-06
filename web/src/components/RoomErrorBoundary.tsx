import { Component, type ErrorInfo, type ReactNode } from 'react';
import { DisconnectModal } from './DisconnectModal';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
}

export class RoomErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(_: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error in Room:', error, errorInfo);
        // You could also log this to an error reporting service
    }

    public render() {
        if (this.state.hasError) {
            // Return the fallback UI: Disconnect Modal
            // The modal has a reload button to recover
            return <DisconnectModal isOpen={true} />;
        }

        return this.props.children;
    }
}
