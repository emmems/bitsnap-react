const LoadingIndicator = ({ className }: { className?: string }) => {
    return (
        <LoadingSpinner color="#ffffff" className={className ?? ''} />
    );
}

export default LoadingIndicator;

const LoadingSpinner = ({ size, color, className }: { size?: string; color?: string; className?: string }) => {
    const spinnerStyle = {
        borderTop: `4px solid ${color}`,
        borderLeft: `4px solid ${color}`,
        borderBottom: `4px solid ${color}`,
        borderRight: '4px solid transparent',
        width: size ?? '30px',
        height: size ?? '30px',
        borderRadius: '50%',
    };

    return <div className={className + ' animate-spin'} style={spinnerStyle}></div>;
};
