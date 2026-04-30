import clsx from 'clsx';

const STEPS: { key: string; label: string }[] = [
  { key: 'PENDING', label: 'Checkout' },
  { key: 'LOCKED', label: 'Escrow Locked' },
  { key: 'SHIPPED', label: 'Seller Shipping' },
  { key: 'DELIVERED', label: 'Delivered' },
  { key: 'RELEASED', label: 'Complete' },
];

interface Props { currentStatus: string; }

export function PaymentStatusTracker({ currentStatus }: Props) {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStatus);

  return (
    <div className="flex items-center justify-between w-full py-4">
      {STEPS.map((step, idx) => (
        <div key={step.key} className="flex flex-col items-center flex-1">
          <div
            className={clsx(
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2',
              idx < currentIdx && 'bg-brand-600 border-brand-600 text-white',
              idx === currentIdx && 'bg-white border-brand-600 text-brand-600',
              idx > currentIdx && 'bg-white border-gray-300 text-gray-400',
            )}
          >
            {idx < currentIdx ? '✓' : idx + 1}
          </div>
          <span
            className={clsx(
              'text-xs mt-1 text-center',
              idx <= currentIdx ? 'text-gray-700 font-medium' : 'text-gray-400',
            )}
          >
            {step.label}
          </span>
          {idx < STEPS.length - 1 && (
            <div
              className={clsx(
                'h-0.5 w-full mt-4',
                idx < currentIdx ? 'bg-brand-600' : 'bg-gray-200',
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
