// Church details and repeated content live in site.json so the /admin Settings screen can edit them.
import data from './site.json';

export interface SiteSettings {
  name: string; city: string; tagline: string; description: string;
  hours: string; phone: string; phoneHref: string; textNumber: string; email: string;
  street: string; cityStateZip: string; mailing: string; mapUrl: string;
  donateUrl: string; donateLabel: string; facebookUrl: string; youtubeUrl: string;
  affiliationName: string; affiliationUrl: string; creditName: string; creditUrl: string;
  newsletterHeading: string;
  nav: { label: string; href: string }[];
  categories: { key: string; label: string; slug: string }[];
}

export const site = data as SiteSettings;
