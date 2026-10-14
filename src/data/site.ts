// Church details shown in the header, footer and contact sections.
// Edit here (or in Pages CMS) and every page picks up the change.
export const site = {
  name: 'Crosstown Community Church',
  city: 'Stockton',
  tagline: 'Come as you are.',
  description:
    'Crosstown Community Church in Stockton, CA. Our mission is to make disciples through worship, growth and service.',
  phone: '(209) 462-6560',
  phoneHref: 'tel:+12094626560',
  email: 'crosstownstockton@gmail.com',
  street: '924 North Filbert Street',
  cityStateZip: 'Stockton, CA 95205',
  mailing: 'P.O. Box 5097, Stockton, CA 95205',
  mapUrl: 'https://goo.gl/maps/quExzCbFR5r72b5S6',
  donateUrl: 'https://crosstown-church.churchcenter.com/giving',
  facebookUrl: 'https://www.facebook.com/crosstowncommunitychurch',
  youtubeUrl: 'https://www.youtube.com/@crosstownstockton9983',
  pastSermonsUrl:
    'https://www.youtube.com/watch?v=qwHFS4a5dPE&list=PL2qqQqZBs7A7O_2bvnYcBUfOxqdgdEqju',
  liveAt5Url: 'https://www.facebook.com/watch/100064523388859/526844176217781',
  affiliation: { name: 'Growing Healthy Churches', url: 'https://growinghealthychurches.com/' },
  // "This Week's Sermon" on the homepage. Update weekly with the YouTube video id
  // (the part after watch?v= in the URL).
  // TODO: confirm the id; Wix showed "Can Your Faith Heal The Planet".
  sermon: { title: 'Can Your Faith Heal The Planet', youtubeId: 'qwHFS4a5dPE' },
  schedule: [
    // TODO: confirm with the church. Wix showed both "11 to 12:30" and "11 to 1".
    { label: 'Sunday Service', time: 'Sundays, 11 a.m. to 12:30 p.m.' },
    { label: 'Bible Study', time: 'Wednesdays, 2 p.m. and 6:30 p.m.' },
    { label: 'Live at 5', time: 'Wednesdays, 5:00 to 5:15 p.m. on Facebook Live' },
  ],
  nav: [
    { label: 'Home', href: '/' },
    { label: 'About Us', href: '/about' },
    { label: 'Ministry Partners', href: '/ministry-partners' },
    { label: 'Community Outreach', href: '/outreach' },
    { label: 'Blog', href: '/blog' },
  ],
};
