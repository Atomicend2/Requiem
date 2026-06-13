import { useGetCommunityStats } from "@workspace/api-client-react/src/generated/api";
import { Button } from "@/components/ui/button";
import { Users, Crosshair, CreditCard, Shield, Activity } from "lucide-react";

export default function Home() {
  const { data: stats, isLoading } = useGetCommunityStats();

  return (
    <div className="min-h-[100dvh]">
      {/* Hero Section — full CSS animated sky, no image dependency */}
      <section className="relative h-[85vh] min-h-[600px] flex items-center justify-center overflow-hidden">
        {/* Sky background layers */}
        <div className="absolute inset-0 z-0">
          {/* Deep night sky base */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#030d1e] via-[#04091a] to-background" />
          {/* Celestial glow orbs */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[140%] h-[60%] bg-[radial-gradient(ellipse_at_center,rgba(225,29,72,0.18),transparent_65%)]" />
          <div className="absolute top-[10%] left-[15%] w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.10),transparent_70%)] blur-3xl" />
          <div className="absolute top-[5%] right-[10%] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,rgba(14,100,200,0.12),transparent_70%)] blur-3xl" />
          {/* Subtle horizon glow */}
          <div className="absolute bottom-0 left-0 right-0 h-[30%] bg-gradient-to-t from-background via-background/80 to-transparent" />
          {/* Hero image (faint sky overlay if exists) */}
          <img
            src="/images/hero-bg.png"
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-25 mix-blend-luminosity"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          {/* Stars */}
          <svg className="absolute inset-0 w-full h-full opacity-60" xmlns="http://www.w3.org/2000/svg">
            {Array.from({ length: 60 }, (_, i) => (
              <circle
                key={i}
                cx={`${(i * 137.508) % 100}%`}
                cy={`${(i * 79.3) % 55}%`}
                r={i % 7 === 0 ? "1.5" : "0.7"}
                fill="white"
                opacity={0.15 + (i % 4) * 0.12}
              />
            ))}
          </svg>
        </div>

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          {/* Pill badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-card border-primary/25 text-primary text-xs font-bold uppercase tracking-[0.35em] mb-8">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(225,29,72,0.9)]" />
            <span className="font-mono">反逆 · The Black Rebellion</span>
          </div>

          {/* Main title */}
          <div className="mb-6">
            <p className="text-rose-200/40 text-sm md:text-base tracking-[0.6em] uppercase font-sans font-light mb-3">Welcome To</p>
            <h1 className="font-serif text-6xl md:text-8xl font-bold leading-none tracking-wider">
              <span className="block bg-gradient-to-b from-white via-rose-100 to-rose-300 bg-clip-text text-transparent drop-shadow-[0_0_40px_rgba(225,29,72,0.5)]">
                反逆
              </span>
              <span className="block text-4xl md:text-5xl mt-2 bg-gradient-to-r from-rose-300 via-primary to-violet-300 bg-clip-text text-transparent neon-text-sky tracking-[0.3em]">
                REQUIEM ORDER
              </span>
            </h1>
          </div>

          <p className="text-base md:text-lg text-rose-100/60 mb-10 max-w-xl mx-auto leading-relaxed font-light">
            Rise against the empire. Collect legendary cards, form guilds, build your economy, and answer the call of Zero.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://chat.whatsapp.com/IZi7UphEO9O76lY8dFYUYn?mode=gi_t"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto"
            >
              <Button
                size="lg"
                className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-white font-bold tracking-[0.2em] uppercase px-10 h-14 rounded-sm neon-border-sky relative overflow-hidden group"
              >
                <span className="relative z-10">Join Requiem Order</span>
                <div className="absolute inset-0 h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
              </Button>
            </a>
            <a href="#stats" className="w-full sm:w-auto">
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto border-primary/30 text-rose-200 hover:bg-primary/10 hover:text-white font-bold tracking-[0.2em] uppercase px-10 h-14 rounded-sm glass-card"
              >
                View Community
              </Button>
            </a>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent z-10" />
      </section>

      {/* Stats Section */}
      <section id="stats" className="py-24 px-4 bg-background relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-primary/40 font-mono tracking-[0.4em] text-xs uppercase mb-2">Live Data</p>
            <h2 className="font-serif text-3xl md:text-4xl font-bold mb-4 neon-text-sky">Community Pulse</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">The rebellion is ever-growing. Witness the scale of our uprising.</p>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[1,2,3,4].map((i) => <div key={i} className="h-36 glass-card rounded-xl animate-pulse bg-white/5" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <StatCard icon={Users}     label="Rebels"      value={stats?.totalMembers ?? 0}      color="text-primary" />
              <StatCard icon={CreditCard}label="Cards Collected"  value={stats?.totalCards ?? 0}        color="text-rose-400" />
              <StatCard icon={Shield}    label="Guilds Active"    value={stats?.totalGuilds ?? 0}       color="text-amber-400" />
              <StatCard icon={Activity}  label="Bots Online"      value={(stats as any)?.totalBots ?? 0} color="text-teal-400" />
            </div>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-4 relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-primary/40 font-mono tracking-[0.4em] text-xs uppercase mb-2">What Awaits</p>
            <h2 className="font-serif text-3xl md:text-4xl font-bold neon-text-sky">The Requiem Order Experience</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="glass-card rounded-xl p-6 border-primary/8 hover:border-primary/25 transition-all duration-300 group hover:-translate-y-1">
                <div className="w-12 h-12 rounded-xl bg-primary/8 border border-primary/15 flex items-center justify-center mb-4 group-hover:shadow-[0_0_20px_rgba(225,29,72,0.3)] transition-shadow">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-serif text-base font-bold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(225,29,72,0.07),transparent)]" />
        <div className="relative z-10 max-w-2xl mx-auto">
          <p className="font-mono text-primary/40 tracking-[0.5em] text-xs uppercase mb-4">反逆</p>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-white neon-text-sky mb-6">The World Is Watching</h2>
          <p className="text-muted-foreground mb-8">Join Requiem Order on WhatsApp and join the rebellion today.</p>
          <a href="https://chat.whatsapp.com/IZi7UphEO9O76lY8dFYUYn?mode=gi_t" target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="bg-primary hover:bg-primary/90 text-white font-bold tracking-[0.2em] uppercase px-12 h-14 neon-border-sky">
              Join the Rebellion
            </Button>
          </a>
        </div>
      </section>
    </div>
  );
}

const FEATURES = [
  { icon: CreditCard, title: "Card Codex",   desc: "Collect rare character cards from across the Requiem Order universe. Tiered T1–TX with unique artwork and lore." },
  { icon: Shield,     title: "Guilds",        desc: "Form powerful guilds with allies. Pool resources, dominate the leaderboard, and claim the empire." },
  { icon: Crosshair,  title: "RPG System",    desc: "Battle in dungeons, level up your character, unlock classes, and take on epic quests." },
  { icon: Activity,   title: "Economy",       desc: "Earn gold, bank your wealth, trade cards, and participate in the Requiem Order lottery." },
  { icon: Users,      title: "Community",     desc: "A thriving WhatsApp-native community with moderation, anti-spam, and real-time rankings." },
  { icon: Shield,     title: "Gacha",         desc: "Pull from the premium gacha pool for exclusive legendary cards. Only Requiem Order members may spin." },
];

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="glass-card rounded-xl p-6 border-primary/8 hover:border-primary/20 transition-all group">
      <div className="flex items-start justify-between mb-4">
        <Icon className={`w-5 h-5 ${color}`} />
        <span className="text-[10px] font-mono text-primary/20 tracking-widest uppercase">反逆</span>
      </div>
      <p className={`text-3xl font-mono font-bold ${color} mb-1`}>
        {value.toLocaleString()}
      </p>
      <p className="text-xs text-muted-foreground uppercase tracking-widest">{label}</p>
    </div>
  );
}
