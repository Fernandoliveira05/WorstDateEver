using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace WorstDateEver
{
    public static class VerifyFirstDate
    {
        [Serializable] private sealed class Cases { public Fixture[] fixtures; }
        [Serializable] private sealed class Fixture
        {
            public string matchId, choice, expectedVenue, expectedEvent, expectedOutcome;
            public int seed;
            public FirstDateStory.Delta expectedRelationship;
        }

        [MenuItem("Worst Date Ever/Verify First Date Fixtures")]
        public static void Run()
        {
            var path = Path.Combine(Application.dataPath, "../../content/shared/first-date-fixtures.json");
            var fixtures = JsonUtility.FromJson<Cases>(File.ReadAllText(path)).fixtures;
            foreach (var fixture in fixtures)
            {
                var handoff = new FirstDateStory.Handoff { avatarGender = "female", preference = "all",
                    matchId = fixture.matchId, substance = "none" };
                var story = new FirstDateStory(handoff, fixture.seed);
                story.Tick(7.5f);
                for (int i = 0; i < 3; i++) story.Choose(fixture.choice);
                story.Tick(3);
                story.Tick(2);
                story.Choose(story.Options().First().id);
                story.Tick(1.5f);
                story.Choose("finish");
                story.Tick(1.5f);
                var state = story.State;
                var matches = state.phase == "completed" && state.venueId == fixture.expectedVenue &&
                    state.completedEventIds.SingleOrDefault() == fixture.expectedEvent && story.Outcome == fixture.expectedOutcome &&
                    JsonUtility.ToJson(state.relationship) == JsonUtility.ToJson(fixture.expectedRelationship);
                if (!matches) throw new InvalidOperationException("First-date fixture drift: " + fixture.matchId);
            }
            Debug.Log($"First Date: {fixtures.Length} shared conformance fixtures passed.");
        }
    }
}
