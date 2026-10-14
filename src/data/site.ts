// Church details and repeated content. Edit here and every page picks up the change.
export const site = {
  name: 'Crosstown Community Church',
  city: 'Stockton',
  tagline: 'Come as you are.',
  description:
    'We believe every person matters to God and there’s no problem in the world that discipleship with Jesus can’t fix.',
  mission:
    'At Crosstown Church we believe that every person matters to God and there’s no problem in the world that discipleship with Jesus can’t fix. Our mission is to make disciples through worship, growth and service.',
  hours: 'Sundays 11-1',
  phone: '(209) 462 6560',
  phoneHref: 'tel:+12094626560',
  textNumber: '209-462-6560',
  email: 'crosstownstockton@gmail.com',
  street: '924 North Filbert Street',
  cityStateZip: 'Stockton, CA 95205',
  mailing: 'P.O. Box 5097 Stockton, CA 95205',
  mapUrl: 'https://goo.gl/maps/quExzCbFR5r72b5S6',
  donateUrl: 'https://crosstown-church.churchcenter.com/giving',
  facebookUrl: 'https://www.facebook.com/crosstowncommunitychurch',
  youtubeUrl: 'https://www.youtube.com/@crosstownstockton9983',
  pastSermonsUrl:
    'https://www.youtube.com/watch?v=qwHFS4a5dPE&list=PL2qqQqZBs7A7O_2bvnYcBUfOxqdgdEqju',
  liveAt5Url: 'https://www.facebook.com/watch/100064523388859/526844176217781',
  vovcUrl: 'https://www.victimsofviolentcrimes.org/',
  affiliation: { name: 'Growing Healthy Churches', url: 'https://growinghealthychurches.com/' },
  // "This Week's Sermon" on the homepage. Update weekly with the YouTube video id
  // (the part after watch?v= in the URL).
  sermon: { title: 'Can Your Faith Heal The Planet', youtubeId: 'qwHFS4a5dPE' },
  nav: [
    { label: 'Home', href: '/' },
    { label: 'About Us', href: '/about' },
    { label: 'Ministry Partners', href: '/ministry-partners' },
    { label: 'Community Outreach', href: '/outreach' },
    { label: 'Blog', href: '/blog' },
  ],
};

export const categories = {
  csi: { label: 'CSI - Crime Scene Intercessors', slug: 'csi-crime-scene-intercessors' },
  'feeding-hands': { label: "God's Feeding Hands", slug: 'god-s-feeding-hands' },
} as const;

export const leaders = [
  { name: 'Kevin White', role: 'Pastor', photo: '/images/about-1.jpg',
    blurb: 'Rev. Kevin White graduated from American Baptist Seminary of the West....' },
  { name: 'Brian Howes', role: 'Church Administrator', photo: '/images/about-4.jpg',
    blurb: 'Brian has attended Crosstown since November 2012 and became an official member shortly thereafter...' },
  { name: 'Paula White', role: 'Lead for Worship Arts', photo: '/images/about-2.jpg',
    blurb: 'Paula founded Crosstown with Pastor Kevin and has been ministering alongside him since the beginning...' },
  { name: 'Christine Carnahan', role: 'Lead Bookkeeper, Primary Sunday School', photo: '/images/about-5.jpg',
    blurb: 'Christine and her husband, Charles, are founding members of Crosstown Community Church...' },
  { name: 'Rose Kaufmann', role: 'Lead for God’s Feeding Hands, Community Outreach', photo: '/images/about-3.jpg',
    blurb: 'Rose has attended Crosstown since 2009 and became an official member shortly thereafter....' },
  { name: 'Charles Carnahan', role: 'Lead of Security, Sound Booth Technician', photo: '/images/about-6.jpg',
    blurb: 'Charles and his wife, Christine, are founding members of Crosstown Community Church....' },
];

// Ministry Partners carousel. Leave `url` empty to hide the "Visit their website" button.
export const partners = [
  {
    name: 'Pray Stockton',
    icon: 'pray',
    text: 'We are creating a prayer chain that unites the body of Christ for the purpose of blanketing the city in prayer. Our goal is to the enlist at least 52 ministries, churches or prayer groups to commit to strategic prayer for one full week. As each church or ministry covers the city in prayer, we ask all participating ministries pray for and with that group. We can’t do this alone.',
    url: '', // TODO: add the Pray Stockton link from the Wix site
  },
  {
    name: 'Stockton Police Chaplaincy',
    icon: 'badge',
    text: 'The SPD works in partnership with our community, to build and maintain relationships of trust and mutual respect while reducing crime and improving quality of life. Communication is a key component to accomplishing the mission of the SPD. Please contact them about services or programs you need.',
    url: '', // TODO: add the Stockton Police Chaplaincy link from the Wix site
  },
  {
    name: 'Victims of Violent Crimes',
    icon: 'dove',
    text: 'The Victims of Violent Crimes of San Joaquin, Inc. Support Group provides ongoing emotional support to help parents, family members and friends through the healing process. Families are given assistance in accessing services and obtaining information on the criminal justice system. If you have recently lost a loved one from violence or if your loved one has been missing, VOVC is a great resource to help and support you.',
    url: 'https://www.victimsofviolentcrimes.org/',
  },
];
