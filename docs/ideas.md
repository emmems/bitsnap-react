# Ideas

Noted during work; not done because they are outside the task or bigger than it.

- **Panel order view (`PublicOrderPage`) is Polish only.** Its labels ("Status
  zamówienia", "Dane klienta", "Produkty", "Komentarze"...) and dates
  (`pl-PL`) ignore `setLocale`, while the order history block inside it follows
  the panel language. Move its strings to `getPanelTexts`. (2026-11-05, H4)
- **Dark mode tokens only flip when `.dark` is inside `.bitsnap-react`.** The
  built CSS scopes the token block as `.bitsnap-react .dark`, but `dark:`
  utilities match any `.dark` ancestor. With `<html class="dark">` the order
  view's `Card` stays white on the black page. Make the token block also match
  `.dark .bitsnap-react`. (2026-11-05, H4)
