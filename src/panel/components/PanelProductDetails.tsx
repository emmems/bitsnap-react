import {
  UserProductType,
  type UserProduct,
} from "../../gen/proto/public/v1/public_api_pb";
import { useInstrumentContext } from "../../analytics/instrument";
import { AudiobookDetails } from "./products/audiobook/AudiobookDetails";
import { FilesSection } from "./products/files/FilesSection";
import { DescriptionSection, ProductShell } from "./products/ProductShell";
import { getProductTexts } from "./products/texts";
import { TicketPass } from "./products/ticket/TicketPass";

export { downloadFileName } from "./products/files/naming";

interface PanelProductDetailsProps {
  accessToken: string;
  product: UserProduct;
  reveal: (product?: UserProduct) => void;
}

/**
 * Detail page of one library product: audiobook player, downloadable files
 * or the event ticket, inside the shared product shell. Each type loads its
 * own data; the grid mounts this with `key` = the product, so switching
 * products starts fresh.
 */
const PanelProductDetails = ({
  accessToken,
  product,
  reveal,
}: PanelProductDetailsProps) => {
  const texts = getProductTexts();
  const instrument = useInstrumentContext();
  const trackDownload = () =>
    instrument.track(
      "panel_download",
      {},
      { product_id: product.productId.length <= 64 ? product.productId : null },
    );
  const onBack = () => reveal();

  if (product.productType === UserProductType.AUDIO) {
    return (
      <AudiobookDetails
        product={product}
        accessToken={accessToken}
        texts={texts}
        onBack={onBack}
        onDownload={trackDownload}
      />
    );
  }

  const ticket = product.productType === UserProductType.TICKET;
  return (
    <ProductShell
      title={product.productName}
      imageUrl={product.productImageUrl || undefined}
      onBack={onBack}
      texts={texts}
    >
      {ticket ? (
        <TicketPass
          accessId={product.accessId}
          accessToken={accessToken}
          productName={product.productName}
          texts={texts}
          onSave={trackDownload}
        />
      ) : product.productType === UserProductType.FILE ? (
        <FilesSection
          accessId={product.accessId}
          accessToken={accessToken}
          productName={product.productName}
          texts={texts}
          onDownload={trackDownload}
        />
      ) : null}
      <DescriptionSection
        card
        heading={ticket ? texts.organizerInfo : texts.aboutProduct}
        text={product.productDescription}
      />
    </ProductShell>
  );
};

export default PanelProductDetails;
