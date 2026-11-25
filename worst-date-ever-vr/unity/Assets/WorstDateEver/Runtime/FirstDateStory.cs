using System;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;

namespace WorstDateEver
{
    public sealed class FirstDateStory
    {
        [Serializable] public sealed class Handoff
        {
            public int schemaVersion = 1, profileIndex;
            public string phase = "exit", avatarGender, preference, matchId, substance;
        }

        [Serializable] public sealed class VenueDefinition
        {
            public string id, matchId, daypart;
        }

        [Serializable] public sealed class Persona
        {
            public string id, openingLine;
            public string[] allowedGestures;
        }

        [Serializable] public sealed class Delta
        {
            public int interest, awkwardness, patience, safety;
        }

        [Serializable] public class Choice
        {
            public string id, label;
        }

        [Serializable] public sealed class EventChoice : Choice
        {
            public Delta relationshipDelta;
            public string contextSummary;
        }

        [Serializable] public sealed class Event
        {
            public string id, visual;
            public string[] venueIds, personaIds;
            public int weight, cooldownSeconds, minElapsedSeconds, minConversationTurns;
            public EventChoice[] choices;
            public string summaryTemplate;
        }

        [Serializable] public sealed class ReplyChoice : Choice
        {
            public int[] delta;
            public string gesture;
        }

        [Serializable] public sealed class ConversationOption : Choice { public string reply; }
        [Serializable] public sealed class ConversationTurn { public ConversationOption[] options; }
        [Serializable] public sealed class Conversation { public string id; public ConversationTurn[] turns; }

        [Serializable] public sealed class Presentation
        {
            public string id, personaId, line, cue, prop, action;
        }

        [Serializable] public sealed class Dialogue
        {
            public ReplyChoice[] choices;
            public Conversation[] conversations;
            public Presentation[] beats, outcomes;
        }

        [Serializable] public sealed class VenueCatalog { public VenueDefinition[] venues; }
        [Serializable] public sealed class PersonaCatalog { public Persona[] personas; }
        [Serializable] public sealed class EventCatalog { public Event[] events; }

        [Serializable] public sealed class ActionRecord { public string eventId, choiceId; }

        [Serializable] public sealed class Session
        {
            public int schemaVersion = 1, eventSeed, turnSequence;
            public string sessionId, matchId, venueId, phase = "waiting", arrivalState = "not_started", activeEventId;
            public string[] completedEventIds = Array.Empty<string>();
            public Delta relationship = new() { interest = 50, awkwardness = 20, patience = 70, safety = 100 };
        }

        [Serializable] public sealed class Checkpoint
        {
            public string attempt, caption, gesture, outcome, beatId, beatPhase, summary;
            public float time, nextBeat, conversationReadyAt, endAt, beatAt, resolvedAt;
            public int talkTurns;
            public Session session;
            public ActionRecord[] actions;
        }

        public readonly Handoff Entry;
        public Session State { get; private set; }
        public readonly Persona Person;
        public readonly VenueDefinition Venue;
        public string Caption { get; private set; } = "Seu encontro já vem.";
        public string Gesture { get; private set; } = "none";
        public string Outcome { get; private set; }
        public string BeatPhase { get; private set; }
        public float Time { get; private set; }
        public Event Beat { get; private set; }
        public Presentation BeatVisual { get; private set; }
        public readonly List<ActionRecord> Actions = new();
        public int TalkTurns { get; private set; }
        public string Summary { get; private set; }
        private uint random;
        private readonly Event[] events;
        private readonly Dialogue dialogue;
        private readonly Conversation conversation;
        private float beatAt, nextBeat, conversationReadyAt, resolvedAt, endAt;

        public static Handoff Transfer(BedroomStory story)
        {
            if (story.phase != BedroomPhase.Exit || !story.HasMatch || story.prep is < 0 or > 3 ||
                story.identity is < 0 or > 1 || story.preference is < 0 or > 2 || !story.Eligible.Contains(story.Current)) return null;
            return new Handoff {
                avatarGender = story.identity == 0 ? "male" : "female",
                preference = new[] { "men", "women", "all" }[story.preference],
                matchId = new[] { "caio", "rafa", "bia", "luiza" }[story.match],
                substance = new[] { "none", "weed", "lsd", "alcohol" }[story.prep],
                profileIndex = story.profile
            };
        }

        public static T Read<T>(string file) =>
            JsonUtility.FromJson<T>(Resources.Load<TextAsset>("FirstDate/" + file).text);

        public FirstDateStory(Handoff handoff, int seed, Checkpoint checkpoint = null)
        {
            Entry = handoff;
            random = unchecked((uint)seed);
            var firstRoll = unchecked(1664525 * (random ^ 0x6d2b79f5u) + 1013904223) / 4294967296d;
            nextBeat = 60f + (float)firstRoll * 30f;
            Person = Read<PersonaCatalog>("personas").personas.First(item => item.id == handoff.matchId);
            Venue = Read<VenueCatalog>("venues").venues.First(item => item.matchId == handoff.matchId);
            dialogue = Read<Dialogue>("dialogue");
            conversation = dialogue.conversations.First(item => item.id == handoff.matchId);
            events = Read<EventCatalog>("events").events;
            State = new Session { sessionId = Guid.NewGuid().ToString(), matchId = Person.id, venueId = Venue.id, eventSeed = seed };
            Restore(checkpoint);
        }

        private void Restore(Checkpoint saved)
        {
            var session = saved?.session;
            if (session == null || session.schemaVersion != 1 || session.matchId != State.matchId ||
                session.venueId != State.venueId || session.eventSeed != State.eventSeed ||
                session.relationship == null || session.completedEventIds == null || saved.time is < 0 or > 86400 ||
                saved.actions == null || saved.actions.Length > 64 || session.completedEventIds.Length > events.Length ||
                !session.completedEventIds.All(id => events.Any(item => item.id == id)) ||
                !new[] { "waiting", "arriving", "greeting", "seating", "dialogue", "ending", "completed" }.Contains(session.phase)) return;
            State = session;
            Time = saved.time;
            nextBeat = saved.nextBeat;
            conversationReadyAt = saved.conversationReadyAt;
            endAt = saved.endAt;
            beatAt = saved.beatAt;
            resolvedAt = saved.resolvedAt;
            TalkTurns = saved.talkTurns;
            Caption = saved.caption;
            Gesture = saved.gesture;
            Outcome = saved.outcome;
            Summary = saved.summary;
            Actions.AddRange(saved.actions);
            BeatPhase = saved.beatPhase;
            Beat = events.FirstOrDefault(item => item.id == saved.beatId);
            BeatVisual = dialogue.beats.FirstOrDefault(item => item.id == saved.beatId && item.personaId == Person.id) ??
                dialogue.beats.FirstOrDefault(item => item.id == saved.beatId && string.IsNullOrEmpty(item.personaId));
            for (var i = 0; i < session.completedEventIds.Length + (string.IsNullOrEmpty(session.activeEventId) ? 0 : 1); i++)
                random = unchecked(1664525 * random + 1013904223);
        }

        public Checkpoint Snapshot(string attempt) => new() {
            attempt = attempt, caption = Caption, gesture = Gesture, time = Time, talkTurns = TalkTurns,
            nextBeat = float.IsInfinity(nextBeat) ? 86400 : nextBeat,
            conversationReadyAt = conversationReadyAt,
            endAt = endAt, beatAt = beatAt, resolvedAt = resolvedAt, summary = Summary,
            outcome = Outcome, beatId = Beat?.id, beatPhase = BeatPhase, session = State, actions = Actions.ToArray()
        };

        public void Tick(float delta, bool allowBeat = true)
        {
            Time += delta;
            if (State.phase == "waiting" && Time >= 1) SetPhase("arriving", "approaching");
            if (State.phase == "arriving" && Time >= 5)
            {
                SetPhase("greeting", "greeting");
                Caption = Person.openingLine;
                Gesture = "wave";
            }
            if (State.phase == "greeting" && Time >= 6.5f) SetPhase("seating", "sitting");
            if (State.phase == "seating" && Time >= 7.4f) SetPhase("dialogue", "seated");
            if (State.phase == "ending" && Time >= endAt) SetPhase("completed", "seated");
            if (State.phase != "dialogue") return;
            if (BeatPhase == "announce" && Time >= beatAt + 1.2f) BeatPhase = "animate";
            if (BeatPhase == "animate" && Time >= beatAt + 3.2f) BeatPhase = "choice_window";
            if (BeatPhase == "resolve" && Time >= resolvedAt + 5f) BeatPhase = "cooldown";
            if (BeatPhase == "cooldown" && Time >= nextBeat) { Beat = null; BeatPhase = null; }
            if (Beat != null || Time < nextBeat || TalkTurns < 1 || Time < conversationReadyAt || !allowBeat ||
                State.completedEventIds.Length >= 4) return;
            var available = events.Where(item => item.venueIds.Contains(Venue.id) && !State.completedEventIds.Contains(item.id) &&
                (item.personaIds == null || item.personaIds.Length == 0 || item.personaIds.Contains(Person.id)) &&
                Time >= item.minElapsedSeconds && TalkTurns >= item.minConversationTurns).ToArray();
            if (available.Length == 0) { nextBeat = float.PositiveInfinity; return; }
            random = unchecked(1664525 * random + 1013904223);
            if (random / 4294967296d > .34d)
            {
                random = unchecked(1664525 * random + 1013904223);
                nextBeat = Time + 12f + (float)(random / 4294967296d) * 12f;
                return;
            }
            random = unchecked(1664525 * random + 1013904223);
            double sample = random / 4294967296d * available.Sum(item => item.weight);
            Beat = available.First(item => (sample -= item.weight) < 0);
            BeatVisual = dialogue.beats.FirstOrDefault(item => item.id == Beat.id && item.personaId == Person.id) ??
                dialogue.beats.First(item => item.id == Beat.id && string.IsNullOrEmpty(item.personaId));
            BeatPhase = "announce";
            beatAt = Time;
            State.activeEventId = Beat.id;
            Caption = BeatVisual.line;
            Gesture = "look_away";
        }

        public Choice[] Options()
        {
            if (State.phase != "dialogue") return Array.Empty<Choice>();
            if (BeatPhase == "choice_window") return Beat.choices;
            if (Beat != null && BeatPhase != "cooldown" || Time < conversationReadyAt) return Array.Empty<Choice>();
            var turn = conversation.turns[Mathf.Min(TalkTurns, conversation.turns.Length - 1)];
            return TalkTurns >= 3 && State.completedEventIds.Length > 0 ?
                turn.options.Cast<Choice>().Append(new Choice { id = "finish", label = "Pedir a conta" }).ToArray() :
                turn.options;
        }

        public bool Choose(string id)
        {
            if (State.phase != "dialogue") return false;
            if (BeatPhase == "choice_window")
            {
                var choice = Beat.choices.FirstOrDefault(option => option.id == id);
                if (choice == null) return false;
                Adjust(choice.relationshipDelta);
                State.completedEventIds = State.completedEventIds.Append(Beat.id).ToArray();
                State.activeEventId = null;
                if (Actions.Count < 64) Actions.Add(new ActionRecord { eventId = Beat.id, choiceId = id });
                Summary = Beat.summaryTemplate.Replace("{choice}", choice.contextSummary ?? choice.id);
                BeatPhase = "resolve";
                resolvedAt = Time;
                nextBeat = Time + Beat.cooldownSeconds;
                conversationReadyAt = Time + 5f;
                Caption = BeatVisual.cue;
                Gesture = "shrug";
                return true;
            }
            if (Beat != null && BeatPhase != "cooldown") return false;
            if (id == "finish" && Time >= conversationReadyAt && TalkTurns >= 3 && State.completedEventIds.Length > 0)
            {
                var relation = State.relationship;
                Outcome = relation.interest <= 38 || relation.awkwardness >= 48 || relation.patience < 40 || relation.safety < 60 ? "disaster" :
                    relation.interest >= 63 && relation.awkwardness <= 26 ? "good" : "awkward";
                Caption = dialogue.outcomes.First(outcome => outcome.id == Outcome).line;
                SetPhase("ending", "seated");
                endAt = Time + 4.5f;
                return true;
            }
            if (Time < conversationReadyAt) return false;
            var selected = dialogue.choices.FirstOrDefault(choice => choice.id == id);
            var turn = conversation.turns[Mathf.Min(TalkTurns, conversation.turns.Length - 1)];
            var option = turn.options.FirstOrDefault(choice => choice.id == id);
            if (selected == null || option == null) return false;
            var d = selected.delta;
            Adjust(new Delta { interest = d[0], awkwardness = d[1], patience = d[2], safety = d[3] });
            if (Actions.Count < 64) Actions.Add(new ActionRecord { eventId = "", choiceId = id });
            Caption = option.reply;
            Gesture = selected.gesture;
            TalkTurns++;
            State.turnSequence++;
            conversationReadyAt = Time + 5.5f;
            return true;
        }

        public bool Remote(int sequence, string text, string gesture)
        {
            if (sequence != State.turnSequence || State.phase != "dialogue" || Time < conversationReadyAt || Beat != null && BeatPhase != "cooldown" ||
                string.IsNullOrWhiteSpace(text) || !Person.allowedGestures.Contains(gesture)) return false;
            var clean = text.Trim();
            Caption = clean.Substring(0, Mathf.Min(500, clean.Length));
            Gesture = gesture;
            TalkTurns++;
            State.turnSequence++;
            conversationReadyAt = Time + 5.5f;
            return true;
        }

        private void Adjust(Delta d)
        {
            var r = State.relationship;
            r.interest = Mathf.Clamp(r.interest + d.interest, 0, 100);
            r.awkwardness = Mathf.Clamp(r.awkwardness + d.awkwardness, 0, 100);
            r.patience = Mathf.Clamp(r.patience + d.patience, 0, 100);
            r.safety = Mathf.Clamp(r.safety + d.safety, 0, 100);
        }

        private void SetPhase(string phase, string arrival) { State.phase = phase; State.arrivalState = arrival; }
    }
}
