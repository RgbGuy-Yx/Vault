export function generateAnonName(): string {
  const adjectives = ["Happy", "Quiet", "Bright", "Dark", "Fast", "Slow", "Brave", "Calm", "Cool", "Swift", "Wild"];
  const nouns = ["Panda", "Fox", "Bear", "Cat", "Dog", "Bird", "Wolf", "Tiger", "Lion", "Shark", "Hawk"];
  
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 1000);
  
  return `${adj}${noun}${num}`;
}

export function getOrGenerateName(): string {
  if (typeof window === "undefined") return "Anonymous"; // SSR check
  
  let name = localStorage.getItem("anon_name");
  if (!name) {
    name = generateAnonName();
    localStorage.setItem("anon_name", name);
  }
  return name;
}