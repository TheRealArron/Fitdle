// components/ui/button.tsx
export const Button = ({ onClick, children }: { onClick: () => void, children: React.ReactNode }) => {
  return (
    <button
      onClick={onClick}
      className="bg-blue-500 text-white p-2 rounded hover:bg-blue-700"
    >
      {children}
    </button>
  );
};
