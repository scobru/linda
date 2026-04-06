export interface SupportArticle {
  id: string;
  title: string;
  content: string;
  category: string;
}

export const supportData: SupportArticle[] = [
  {
    id: "what-is-linda",
    category: "General Overview",
    title: "What is Linda?",
    content: "Linda is a secure communication tool that lets you chat and share media without relying on central servers. It's fully peer-to-peer (P2P), meaning all interactions occur directly between users without intermediaries."
  },
  {
    id: "is-linda-encrypted",
    category: "Security & Privacy",
    title: "Is Linda encrypted?",
    content: "Yes, Linda uses end-to-end encryption via the Signal Protocol. This means only the people involved in the conversation can see and access the data being shared. No metadata is stored on the cloud."
  },
  {
    id: "how-it-works",
    category: "General Overview",
    title: "How does it work without servers?",
    content: "Linda is built on GunDB and Shogun technology. Instead of using central servers, your data is stored and sent directly between user devices. This makes it resilient to outages and ensures your privacy."
  },
  {
    id: "getting-started",
    category: "Installation & Setup",
    title: "How do I get started?",
    content: "Simply open the app and log in with your Shogun identity. Once logged in, you can add contacts using their unique username (e.g., @name1234) or their public key."
  },
  {
    id: "file-sharing",
    category: "Features",
    title: "Can I share files?",
    content: "Yes! Linda allows you to share files of any size directly with your contacts. Since it's P2P, there are no cloud-imposed size limits or compression."
  },
  {
    id: "backup-keys",
    category: "Security & Privacy",
    title: "How do I back up my account?",
    content: "Your identity is tied to your Shogun keys. You can export your GunDB keys from the Profile Settings. **Keep these keys safe**, as they are the only way to recover your account if you lose access to your device."
  }
];
