import { getContext, setContext } from 'svelte';
import { DocumentDomain } from './document-domain';

const DOMAIN = Symbol('document-domain');
export const setDocumentDomain = () => setContext(DOMAIN, new DocumentDomain());
export const getDocumentDomain = () => getContext<DocumentDomain | undefined>(DOMAIN);
