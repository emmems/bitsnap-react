import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Lock,
  Package,
  Truck,
} from "lucide-react";
import { useState, type CSSProperties } from "react";
import { rpcProvider, useMutation, useQuery } from "../../rpc-provider";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";

import { usePanelConfig } from "../PanelProvider";

interface Props {
  orderID: string;
  initialEmail?: string;
  accessToken?: string;
  onBack?: () => void;
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<
    string,
    { color: string; icon: typeof AlertCircle | null }
  > = {
    created: { color: "bg-neutral-100 text-neutral-700", icon: null },
    paid: { color: "bg-green-100 text-green-700", icon: CheckCircle2 },
    completed: { color: "bg-blue-100 text-blue-700", icon: CheckCircle2 },
    canceled: { color: "bg-red-100 text-red-700", icon: AlertCircle },
    sent: { color: "bg-purple-100 text-purple-700", icon: Truck },
    processing: { color: "bg-yellow-100 text-yellow-700", icon: Loader2 },
  };

  const config = statusConfig[status] || statusConfig.created;
  const Icon = config.icon;

  const statusLabels: Record<string, string> = {
    created: "Utworzone",
    paid: "Opłacone",
    completed: "Zakończone",
    canceled: "Anulowane",
    sent: "Wysłane",
    processing: "Przetwarzane",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${config.color}`}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {statusLabels[status] || status}
    </span>
  );
}

function AddCommentForm({
  orderID,
  email,
}: {
  orderID: string;
  email: string;
}) {
  const [message, setMessage] = useState("");
  const addCommentMutation = useMutation(
    rpcProvider.publicApi.addPublicOrderComment,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    try {
      await addCommentMutation.mutateAsync({
        projectId: "",
        orderId: orderID,
        message: message.trim(),
        accessToken: email,
      });
      setMessage("");
    } catch (error) {
      console.error("Failed to add comment:", error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-2">
      <Label htmlFor="comment">Dodaj komentarz</Label>
      <Textarea
        id="comment"
        value={message}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
          setMessage(e.target.value)
        }
        placeholder="Wpisz komentarz..."
        rows={3}
        disabled={addCommentMutation.isPending}
      />
      <Button
        type="submit"
        disabled={!message.trim() || addCommentMutation.isPending}
      >
        {addCommentMutation.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Wysyłanie...
          </>
        ) : (
          "Dodaj komentarz"
        )}
      </Button>
    </form>
  );
}

function formatDate(timestamp: { seconds: bigint } | undefined): string {
  if (!timestamp) return "N/A";
  const date = new Date(Number(timestamp.seconds) * 1000);
  return date.toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function PublicOrderPageContent({
  orderID,
  initialEmail,
  onBack,
  accessToken,
}: Props) {
  const { theme, projectID } = usePanelConfig();

  const [verifyEmail, setVerifyEmail] = useState(initialEmail || "");
  const [isVerifyDialogOpen, setIsVerifyDialogOpen] = useState(false);

  const {
    data: orderData,
    isLoading,
    error,
    refetch,
  } = useQuery(
    rpcProvider.publicApi.getPublicOrderDetails,
    {
      projectId: projectID ?? "",
      orderId: orderID,
      email: verifyEmail || undefined,
      accessToken: accessToken,
    },
    { enabled: !!orderID },
  );

  const order =
    orderData?.result.case === "order" ? orderData.result.value : null;
  const isVerified = order?.isVerified ?? false;

  const handleVerifyEmail = () => {
    refetch();
    setIsVerifyDialogOpen(false);
  };

  const styles = {
    "--button-background-color": theme?.colors?.brand ?? "#000000",
    "--button-background-color-dark": theme?.colors?.brandDark ?? "#ffffff",
    "--button-text-color": theme?.colors?.brandDark ?? "#000000",
    "--button-text-color-dark": theme?.colors?.brand ?? "#000000",
  } as CSSProperties;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-neutral-400" />
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Ładowanie zamówienia...
          </p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
              <h2 className="mt-4 text-xl font-semibold">
                Zamówienie nie znalezione
              </h2>
              <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                Nie znaleziono zamówienia o podanym numerze.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full bg-white py-8 dark:bg-black" style={styles}>
      <div className="w-full px-4">
        {onBack && (
          <Button onClick={onBack} variant="ghost" className="mb-4 w-fit">
            <ChevronLeft className="h-4 w-4" />
            Wróć do historii zamówień
          </Button>
        )}
        <div className="mb-6 flex items-center gap-4">
          {theme?.logoURL && (
            <>
              <img
                src={theme.logoURL}
                alt="Project logo"
                className={`h-12 w-auto ${theme.logoDarkURL ? "dark:hidden" : ""}`}
              />
              {theme.logoDarkURL && (
                <img
                  src={theme.logoDarkURL}
                  alt="Project logo"
                  className="hidden h-12 w-auto dark:block"
                />
              )}
            </>
          )}
          <div>
            <h1 className="text-3xl font-bold">Zamówienie</h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              Numer zamówienia: #{order.orderId}
            </p>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Package className="mr-2 h-5 w-5" />
              Status zamówienia
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-center gap-2">
                <StatusBadge status={order.status} />
                {order.processingStatus && (
                  <span className="text-sm text-neutral-600">
                    · {order.processingStatus}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-neutral-600">
                Zamówienie złożone {formatDate(order.createdAt)}
              </p>
            </div>

            <div className="border-t pt-4">
              <h3 className="mb-3 font-semibold">Dane klienta</h3>
              <div className="space-y-2">
                <div>
                  <span className="font-medium">Imię i nazwisko:</span>{" "}
                  <span className={!isVerified ? "text-neutral-500" : ""}>
                    {order.customerName}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Email:</span>{" "}
                  <span className={!isVerified ? "text-neutral-500" : ""}>
                    {order.customerEmail}
                  </span>
                </div>
                {order.customerPhone && (
                  <div>
                    <span className="font-medium">Telefon:</span>{" "}
                    <span className={!isVerified ? "text-neutral-500" : ""}>
                      {order.customerPhone}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {!isVerified && (
              <div className="border-t pt-4">
                <Button
                  onClick={() => setIsVerifyDialogOpen(true)}
                  variant="outline"
                  className="w-full"
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Zweryfikuj swój email
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Produkty</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              {order.items.map((item, index) => (
                <div key={index} className="flex items-center gap-4">
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-16 w-16 rounded object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-neutral-600">
                      Ilość: {item.quantity}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      {formatCurrency(Number(item.price), item.currency)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {(order.deliveryAddress || order.deliveryMethod) && (
              <div className="border-t pt-4">
                <h3 className="mb-3 flex items-center font-semibold">
                  <Truck className="mr-2 h-5 w-5" />
                  Informacje o dostawie
                </h3>
                <div className="space-y-2">
                  {order.deliveryAddress && (
                    <div>
                      <span className="font-medium">Adres:</span>{" "}
                      <span className={!isVerified ? "text-neutral-500" : ""}>
                        {order.deliveryAddress}
                      </span>
                    </div>
                  )}
                  {order.deliveryMethod && (
                    <div>
                      <span className="font-medium">Metoda:</span>{" "}
                      {order.deliveryMethod}
                    </div>
                  )}
                  {order.trackingNumber && isVerified && (
                    <div>
                      <span className="font-medium">Tracking:</span>{" "}
                      {order.trackingNumber}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="border-t pt-4">
              <div className="flex justify-between text-lg font-bold">
                <span>Suma:</span>
                <span>
                  {formatCurrency(Number(order.totalAmount), order.currency)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Komentarze {order.commentCount > 0 && `(${order.commentCount})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {order.comments.length > 0 ? (
              <div className="space-y-4">
                {order.comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="border-b pb-4 last:border-b-0"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-medium">
                        {comment.authorName || "System"}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {formatDate(comment.createdAt)}
                      </span>
                      {comment.authorType === "admin" && (
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                          Admin
                        </span>
                      )}
                    </div>
                    <p className={!isVerified ? "text-neutral-500" : ""}>
                      {comment.message}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-neutral-600">Brak komentarzy.</p>
            )}

            {isVerified ? (
              <AddCommentForm orderID={order.orderId} email={verifyEmail} />
            ) : (
              <div className="mt-4">
                <Button
                  onClick={() => setIsVerifyDialogOpen(true)}
                  variant="outline"
                  className="w-full"
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Zweryfikuj swój email
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {isVerifyDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>Zweryfikuj swój email</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-neutral-700">
                  Podaj adres email użyty przy składaniu zamówienia.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="verify-email">Adres email</Label>
                  <Input
                    id="verify-email"
                    type="email"
                    placeholder="twoj@email.com"
                    value={verifyEmail}
                    onChange={(e) => setVerifyEmail(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsVerifyDialogOpen(false)}
                    className="flex-1"
                  >
                    Anuluj
                  </Button>
                  <Button onClick={handleVerifyEmail} className="flex-1">
                    Zweryfikuj
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function PublicOrderPage(props: Props) {
  return <PublicOrderPageContent {...props} />;
}
export default PublicOrderPage;
