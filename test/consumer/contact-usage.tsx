import { ContactForm, useContactForm, type ContactFormProps, type ContactFailure, type ContactConfig, type ContactAppearance, type ContactTexts } from 'bitsnap-react/contact';
const appearance: ContactAppearance = {theme:'auto',tokens:{accent:'#123456'},elements:{dialog:{style:{padding:24}}}};
const texts: Partial<ContactTexts> = {submit:'Send'};
const props: ContactFormProps = {projectID:'project',mode:'floating',launcher:{position:'bottom-left'},appearance,texts,fields:{topic:false},product:{id:'product',name:'Course'},onError:(error: ContactFailure) => console.log(error.code)};
export const contact = <ContactForm {...props}/>;
export function CustomContact() {
 const form = useContactForm({projectID:'project'});
 const config: ContactConfig | null = form.config;
 return <button disabled={!config} onClick={() => {form.setValue('email','a@example.com');void form.submit();}}>{form.status}</button>;
}
