export default function NeedInvite({ message }: { message?: string }) {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="card max-w-sm p-8 text-center">
        <div className="mb-3 text-4xl">✉️</div>
        <h1 className="mb-2 text-xl font-semibold">You need an invite link to use this app</h1>
        <p className="muted">
          {message || 'Please ask Angon for your personal invite link, then open it on this device.'}
        </p>
      </div>
    </div>
  );
}
